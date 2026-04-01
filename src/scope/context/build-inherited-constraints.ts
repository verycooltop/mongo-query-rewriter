import { isFalseNode, isFieldNode, isLogicalNode, isOpaqueNode, isTrueNode } from "../../ast/guards";
import type { FieldNode, QueryNode } from "../../ast/types";
import { buildFieldPredicateBundleFromFieldNode } from "../../predicate/ir/build-field-bundle";
import type { FieldPredicateBundle } from "../../predicate/ir/field-predicate-bundle";
import type { PredicateAtom } from "../../predicate/ir/predicate-atom";
import type { ConstraintExtractionRejection, ConstraintSet } from "./constraint-set";
import { emptyConstraintSet } from "./constraint-set";
import { mergeManyConstraintSources } from "./merge-constraint-sources";

/**
 * Phase-1 inherited constraints: only plain equality, guarded $in, and simple range atoms.
 * Excludes exists / nin / ne / opaque / array-null-sensitive bundles / path-conflict-risk fields.
 */
const ALLOWED_INHERITED_ATOM_KINDS = new Set<PredicateAtom["kind"]>(["eq", "gt", "gte", "lt", "lte", "in"]);

function pushRejection(
    set: ConstraintSet,
    fieldPath: string,
    atomKind: string,
    reason: string
): void {
    set.metadata.extractionRejections.push({ fieldPath, atomKind, reason });
}

function atomAllowedForInherited(
    atom: PredicateAtom,
    fieldPath: string,
    set: ConstraintSet
): boolean {
    if (atom.kind === "opaque") {
        pushRejection(set, fieldPath, "opaque", "opaque operators are not inherited");
        return false;
    }
    if (atom.kind === "exists") {
        pushRejection(set, fieldPath, "exists", "exists semantics are not inherited in phase 1");
        return false;
    }
    if (atom.kind === "nin") {
        pushRejection(set, fieldPath, "nin", "nin is not inherited");
        return false;
    }
    if (atom.kind === "ne") {
        pushRejection(set, fieldPath, "ne", "ne is omitted from inherited constraints (conservative)");
        return false;
    }
    if (!ALLOWED_INHERITED_ATOM_KINDS.has(atom.kind)) {
        pushRejection(set, fieldPath, atom.kind, "atom kind not in inherited constraint allowlist");
        return false;
    }
    return true;
}

function rejectWholeField(
    set: ConstraintSet,
    fieldPath: string,
    atomKind: string,
    reason: string,
    markUnsupported: boolean
): ConstraintSet {
    pushRejection(set, fieldPath, atomKind, reason);
    if (markUnsupported) {
        set.metadata.hasUnsupportedSemantics = true;
    }
    return set;
}

function fieldBundleDisallowedForInherited(
    bundle: FieldPredicateBundle,
    set: ConstraintSet,
    fieldPath: string
): boolean {
    if (bundle.metadata.hasUnsupportedOperators) {
        rejectWholeField(set, fieldPath, "*", "bundle contains opaque or unsupported operators", true);
        return true;
    }
    if (bundle.metadata.hasArraySensitiveSemantics) {
        rejectWholeField(set, fieldPath, "*", "array-sensitive field bundle is not inherited", true);
        return true;
    }
    if (bundle.metadata.hasNullSemantics) {
        rejectWholeField(set, fieldPath, "*", "null-sensitive field bundle is not inherited", true);
        return true;
    }
    if (bundle.metadata.hasDottedPathConflictRisk) {
        rejectWholeField(set, fieldPath, "*", "path conflict risk: field excluded from inherited constraints", true);
        return true;
    }
    return false;
}

function fieldNodeToConstraintSet(node: FieldNode): ConstraintSet {
    const bundle = buildFieldPredicateBundleFromFieldNode(node);
    const set = emptyConstraintSet();

    if (fieldBundleDisallowedForInherited(bundle, set, node.field)) {
        return set;
    }

    const allowed: PredicateAtom[] = [];
    for (const atom of bundle.predicates) {
        if (atomAllowedForInherited(atom, node.field, set)) {
            allowed.push(atom);
        }
    }
    if (allowed.length > 0) {
        set.byField.set(node.field, allowed);
    }
    return set;
}

export function constraintSetFromFieldNode(node: FieldNode): ConstraintSet {
    return fieldNodeToConstraintSet(node);
}

export function constraintSetFromQueryNode(node: QueryNode): ConstraintSet {
    if (isTrueNode(node)) {
        return emptyConstraintSet();
    }
    if (isFalseNode(node)) {
        const set = emptyConstraintSet();
        set.metadata.hasUnsupportedSemantics = true;
        pushRejection(set, "?", "*", "false node has no safe inherited constraints");
        return set;
    }
    if (isFieldNode(node)) {
        return fieldNodeToConstraintSet(node);
    }
    if (isOpaqueNode(node)) {
        const set = emptyConstraintSet();
        set.opaqueConstraints.push(node);
        set.metadata.hasUnsupportedSemantics = true;
        pushRejection(set, "?", "opaque", "opaque query node is not converted to inherited constraints");
        return set;
    }
    if (isLogicalNode(node) && node.op === "$and") {
        const parts = node.children.map((c) => constraintSetFromQueryNode(c));
        return mergeManyConstraintSources(parts);
    }
    const set = emptyConstraintSet();
    set.metadata.hasUnsupportedSemantics = true;
    pushRejection(set, "?", "*", "non-$and compound shape is not a constraint source for phase 1");
    return set;
}

export function mergeConstraintRejectionLists(
    target: ConstraintExtractionRejection[],
    more: ConstraintExtractionRejection[]
): void {
    target.push(...more);
}
