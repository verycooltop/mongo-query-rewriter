import type { FieldNode, FieldPredicate } from "../../ast/types";
import { detectArraySensitiveSemantics } from "../analysis/detect-array-sensitive";
import { detectDottedPathConflictRisk } from "../analysis/detect-path-conflict-risk";
import { detectNullSensitiveSemantics } from "../analysis/detect-null-sensitive";
import { detectOpaqueMix } from "../analysis/detect-opaque-mix";
import type { FieldPredicateBundle } from "./field-predicate-bundle";
import type { PredicateAtom } from "./predicate-atom";

function fieldPredicateToAtom(predicate: FieldPredicate): PredicateAtom {
    if (predicate.opaque || predicate.op === "raw") {
        return { kind: "opaque", operator: predicate.op, raw: predicate.value };
    }

    switch (predicate.op) {
        case "$eq":
            return { kind: "eq", value: predicate.value };
        case "$ne":
            return { kind: "ne", value: predicate.value };
        case "$in":
            return {
                kind: "in",
                values: Array.isArray(predicate.value) ? [...(predicate.value as unknown[])] : [predicate.value],
            };
        case "$nin":
            return {
                kind: "nin",
                values: Array.isArray(predicate.value) ? [...(predicate.value as unknown[])] : [predicate.value],
            };
        case "$gt":
            return { kind: "gt", value: predicate.value };
        case "$gte":
            return { kind: "gte", value: predicate.value };
        case "$lt":
            return { kind: "lt", value: predicate.value };
        case "$lte":
            return { kind: "lte", value: predicate.value };
        case "$exists":
            return { kind: "exists", value: Boolean(predicate.value) };
        default:
            return { kind: "opaque", operator: predicate.op, raw: predicate.value };
    }
}

function computeMetadata(bundle: FieldPredicateBundle): FieldPredicateBundle["metadata"] {
    const hasUnsupportedOperators = bundle.predicates.some((a) => a.kind === "opaque");
    return {
        hasArraySensitiveSemantics: detectArraySensitiveSemantics(bundle),
        hasNullSemantics: detectNullSensitiveSemantics(bundle),
        hasUnsupportedOperators,
        hasDottedPathConflictRisk: detectDottedPathConflictRisk(bundle),
    };
}

export function buildFieldPredicateBundleFromFieldNode(node: FieldNode): FieldPredicateBundle {
    const predicates = node.predicates.map(fieldPredicateToAtom);
    const bundle: FieldPredicateBundle = {
        fieldPath: node.field,
        sourceNodes: [node],
        predicates,
        opaqueNodes: [],
        metadata: {
            hasArraySensitiveSemantics: false,
            hasNullSemantics: false,
            hasUnsupportedOperators: false,
            hasDottedPathConflictRisk: false,
        },
    };
    bundle.metadata = computeMetadata(bundle);
    return bundle;
}

export function cloneBundle(bundle: FieldPredicateBundle): FieldPredicateBundle {
    return {
        fieldPath: bundle.fieldPath,
        sourceNodes: [...bundle.sourceNodes],
        predicates: [...bundle.predicates],
        opaqueNodes: [...bundle.opaqueNodes],
        metadata: { ...bundle.metadata },
    };
}

export function refreshBundleMetadata(bundle: FieldPredicateBundle): FieldPredicateBundle {
    return {
        ...bundle,
        metadata: computeMetadata(bundle),
    };
}

export function detectUnsupportedMix(bundle: FieldPredicateBundle): boolean {
    return detectOpaqueMix(bundle);
}
