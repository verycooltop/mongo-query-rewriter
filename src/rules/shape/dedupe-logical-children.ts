import { hashNode } from "../../ast/hash";
import { andNode, orNode } from "../../ast/builders";
import { isLogicalNode } from "../../ast/guards";
import type { QueryNode } from "../../ast/types";
import type { NormalizeContext } from "../../normalize-context";
import { markRuleApplied, markRuleSkipped } from "../../observe/warnings";

export const RULE_ID = "shape.dedupeLogicalChildren";

export function uniqueChildrenByHash(children: QueryNode[]): QueryNode[] {
    const seen = new Set<string>();
    const result: QueryNode[] = [];

    for (const child of children) {
        const key = hashNode(child);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(child);
    }

    return result;
}

export function dedupeLogicalChildren(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (!isLogicalNode(node)) {
        markRuleSkipped(normalizeContext, RULE_ID, "node is not a compound ($and/$or) node");
        return node;
    }

    const deduped = uniqueChildrenByHash(node.children);

    if (deduped.length === node.children.length) {
        markRuleSkipped(normalizeContext, RULE_ID, "no duplicate children");
        return node;
    }

    markRuleApplied(normalizeContext, RULE_ID);
    return node.op === "$and" ? andNode(deduped) : orNode(deduped);
}
