import { andNode, fieldNode, orNode } from "../ast/builders";
import { hashPredicate } from "../ast/hash";
import { isFieldNode, isLogicalNode } from "../ast/guards";
import type { FieldNode, FieldPredicate, QueryNode } from "../ast/types";
import type { NormalizeContext } from "../normalize-context";
import type { PredicateFieldTrace } from "../types";
import { markRuleApplied, markRuleSkipped } from "../observe/warnings";
import { buildFieldPredicateBundleFromFieldNode } from "../predicate/ir/build-field-bundle";
import {
    compileLocalNormalizeResultToAst,
    normalizeFieldPredicateBundle,
} from "../predicate/normalize-field-predicate-bundle";

export function normalizePredicate(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    return normalizePredicateRecursive(node, normalizeContext);
}

function normalizePredicateRecursive(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (isLogicalNode(node)) {
        const nextChildren = node.children.map((child) => normalizePredicateRecursive(child, normalizeContext));
        const mergedChildren =
            node.op === "$and" ? mergeAndSiblingFieldNodesUnderAnd(nextChildren, normalizeContext) : nextChildren;

        return node.op === "$and" ? andNode(mergedChildren) : orNode(mergedChildren);
    }

    if (isFieldNode(node)) {
        return applyPredicateRulesToField(node, normalizeContext);
    }

    return node;
}

function mergeAndSiblingFieldNodesUnderAnd(children: QueryNode[], normalizeContext: NormalizeContext): QueryNode[] {
    const byField = new Map<string, FieldPredicate[]>();
    const rest: QueryNode[] = [];

    for (const child of children) {
        if (isFieldNode(child)) {
            const cur = byField.get(child.field) ?? [];
            byField.set(child.field, [...cur, ...child.predicates]);
        } else {
            rest.push(child);
        }
    }

    const merged: QueryNode[] = [];
    for (const [field, preds] of byField) {
        merged.push(applyPredicateRulesToField(fieldNode(field, preds), normalizeContext));
    }

    return [...rest, ...merged];
}

const RULE_DEDUPE = "predicate.dedupeSameFieldPredicates";
const RULE_MERGE = "predicate.mergeComparablePredicates";
const RULE_COLLAPSE = "predicate.collapseContradictions";

const MERGE_CAPABILITY_IDS = ["eq.eq", "eq.in", "eq.range", "range.range"];

function fieldPredicatesUnchanged(a: FieldPredicate[], b: FieldPredicate[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((p, i) => hashPredicate(p) === hashPredicate(b[i]));
}

function applyPredicateRulesToField(node: FieldNode, normalizeContext: NormalizeContext): QueryNode {
    const rules = normalizeContext.options.rules;
    const runAny = rules.dedupeSameFieldPredicates || rules.mergeComparablePredicates || rules.collapseContradictions;

    if (!runAny) {
        markRuleSkipped(normalizeContext, RULE_DEDUPE, "predicate rules disabled");
        markRuleSkipped(normalizeContext, RULE_MERGE, "predicate rules disabled");
        markRuleSkipped(normalizeContext, RULE_COLLAPSE, "predicate rules disabled");
        return node;
    }

    const bundle = buildFieldPredicateBundleFromFieldNode(node);
    const local = normalizeFieldPredicateBundle(bundle, {
        safety: normalizeContext.options.predicate.safetyPolicy,
        engine: {
            dedupeAtoms: rules.dedupeSameFieldPredicates,
            mergeComparable: rules.mergeComparablePredicates,
            collapseContradictions: rules.collapseContradictions,
        },
    });

    const out = compileLocalNormalizeResultToAst(local);

    if (normalizeContext.options.observe.collectPredicateTraces) {
        const trace: PredicateFieldTrace = {
            field: node.field,
            atomKinds: local.atomKinds,
            appliedCapabilityIds: [...local.appliedCapabilities],
            skippedCapabilities: local.skippedCapabilities.map((s) => ({
                id: s.id,
                reason: s.reason,
            })),
            contradiction: local.contradiction,
            contradictionCapabilityId: local.contradiction ? local.contradictionCapabilityId : undefined,
            hadCoverage: local.coveredAtoms.length > 0,
            coverageAtomCount: local.coveredAtoms.length,
            hadTighten: local.changed && !local.contradiction,
            impossibleEmitted: local.contradiction,
        };
        if (!normalizeContext.predicateTraces) {
            normalizeContext.predicateTraces = [];
        }
        normalizeContext.predicateTraces.push(trace);
    }

    if (rules.dedupeSameFieldPredicates) {
        if (local.atomDedupeChanged) {
            markRuleApplied(normalizeContext, RULE_DEDUPE);
        } else {
            markRuleSkipped(normalizeContext, RULE_DEDUPE, "no duplicate predicates");
        }
    } else {
        markRuleSkipped(normalizeContext, RULE_DEDUPE, "rule disabled");
    }

    if (rules.mergeComparablePredicates) {
        const mergeTouched = local.appliedCapabilities.some((id) => MERGE_CAPABILITY_IDS.includes(id));
        if (mergeTouched) {
            markRuleApplied(normalizeContext, RULE_MERGE);
        } else {
            markRuleSkipped(normalizeContext, RULE_MERGE, "no comparable predicate merge applied");
        }
    } else {
        markRuleSkipped(normalizeContext, RULE_MERGE, "rule disabled");
    }

    if (rules.collapseContradictions) {
        const collapseContradictionCaps = ["eq.ne", "eq.in"];
        const collapseHit =
            local.appliedCapabilities.includes("eq.ne") ||
            (local.contradiction &&
                local.contradictionCapabilityId !== undefined &&
                collapseContradictionCaps.includes(local.contradictionCapabilityId));
        if (collapseHit) {
            markRuleApplied(normalizeContext, RULE_COLLAPSE);
        } else {
            markRuleSkipped(normalizeContext, RULE_COLLAPSE, "no explicit contradiction");
        }
    } else {
        markRuleSkipped(normalizeContext, RULE_COLLAPSE, "rule disabled");
    }

    if (isFieldNode(out) && out.field === node.field && fieldPredicatesUnchanged(out.predicates, node.predicates)) {
        return node;
    }

    return out;
}
