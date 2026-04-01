import { andNode, orNode } from "../../ast/builders";
import { isLogicalNode } from "../../ast/guards";
import type { LogicalNode, QueryNode } from "../../ast/types";
import type { NormalizeContext } from "../../normalize-context";
import { markRuleApplied, markRuleSkipped } from "../../observe/warnings";

export const RULE_ID = "shape.flattenLogical";

export function flattenLogicalChildren(node: LogicalNode): QueryNode[] {
    const result: QueryNode[] = [];

    for (const child of node.children) {
        if (isLogicalNode(child) && child.op === node.op) {
            result.push(...child.children);
        } else {
            result.push(child);
        }
    }

    return result;
}

export function flattenLogical(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (!isLogicalNode(node)) {
        markRuleSkipped(normalizeContext, RULE_ID, "node is not a compound ($and/$or) node");
        return node;
    }

    const nextChildren = flattenLogicalChildren(node);

    const changed =
        nextChildren.length !== node.children.length ||
        nextChildren.some((c, i) => c !== node.children[i]);

    if (changed) {
        markRuleApplied(normalizeContext, RULE_ID);
        return node.op === "$and" ? andNode(nextChildren) : orNode(nextChildren);
    }

    markRuleSkipped(normalizeContext, RULE_ID, "no nested same-op compound nodes");
    return node;
}
