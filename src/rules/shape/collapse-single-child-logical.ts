import { isLogicalNode } from "../../ast/guards";
import type { QueryNode } from "../../ast/types";
import type { NormalizeContext } from "../../normalize-context";
import { markRuleApplied, markRuleSkipped } from "../../observe/warnings";

export const RULE_ID = "shape.collapseSingleChildLogical";

export function collapseSingleChildLogical(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    if (!isLogicalNode(node)) {
        markRuleSkipped(normalizeContext, RULE_ID, "node is not a compound ($and/$or) node");
        return node;
    }

    if (node.children.length !== 1) {
        markRuleSkipped(normalizeContext, RULE_ID, "child count is not 1");
        return node;
    }

    markRuleApplied(normalizeContext, RULE_ID);
    return node.children[0];
}
