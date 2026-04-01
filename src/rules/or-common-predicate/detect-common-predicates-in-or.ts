import { andNode, orNode } from "../../ast/builders";
import { hashPredicate } from "../../ast/hash";
import { isFieldNode, isLogicalNode } from "../../ast/guards";
import type { LogicalNode, QueryNode } from "../../ast/types";
import type { NormalizeContext } from "../../normalize-context";
import { addWarning, markRuleApplied, markRuleSkipped } from "../../observe/warnings";

/** $or 分支间公共 field 谓词检测（`scope` 层可选规则，由 `rules.detectCommonPredicatesInOr` 控制；仅告警，不改写结构）。 */
export const RULE_ID = "orCommonPredicate.detectCommonPredicatesInOr";

export function detectCommonPredicatesInOr(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (!isLogicalNode(node)) {
        return node;
    }

    if (node.op === "$or") {
        detectCommonPredicates(node, normalizeContext);
    }

    const nextChildren = node.children.map((child) => detectCommonPredicatesInOr(child, normalizeContext));

    return node.op === "$and" ? andNode(nextChildren) : orNode(nextChildren);
}

function detectCommonPredicates(node: LogicalNode, normalizeContext: NormalizeContext): void {
    const maps = node.children.map((branch) => extractComparableFieldPredicates(branch));
    const common = intersectPredicateMaps(maps);

    if (common.size === 0) {
        markRuleSkipped(normalizeContext, RULE_ID, "no common predicates found in $or");
        return;
    }

    markRuleApplied(normalizeContext, RULE_ID);
    addWarning(normalizeContext, `common predicates detected in $or: ${formatPredicateMap(common)}`);
}

function extractComparableFieldPredicates(node: QueryNode): Map<string, string[]> {
    const map = new Map<string, string[]>();

    if (isFieldNode(node)) {
        const safe = node.predicates
            .filter((p) => !p.opaque && p.op !== "raw")
            .map((p) => hashPredicate(p));

        if (safe.length > 0) {
            map.set(node.field, safe);
        }

        return map;
    }

    if (isLogicalNode(node) && node.op === "$and") {
        for (const child of node.children) {
            if (!isFieldNode(child)) {
                continue;
            }

            const safe = child.predicates
                .filter((p) => !p.opaque && p.op !== "raw")
                .map((p) => hashPredicate(p));

            if (safe.length > 0) {
                map.set(child.field, safe);
            }
        }
    }

    return map;
}

function intersectPredicateMaps(maps: Map<string, string[]>[]): Map<string, string[]> {
    if (maps.length === 0) {
        return new Map();
    }

    const result = new Map(maps[0]);

    for (let i = 1; i < maps.length; i += 1) {
        for (const [field, predicates] of [...result.entries()]) {
            const other = maps[i].get(field);
            if (!other) {
                result.delete(field);
                continue;
            }

            const intersection = predicates.filter((p) => other.includes(p));
            if (intersection.length === 0) {
                result.delete(field);
            } else {
                result.set(field, intersection);
            }
        }
    }

    return result;
}

function formatPredicateMap(common: Map<string, string[]>): string {
    return JSON.stringify([...common.entries()]);
}
