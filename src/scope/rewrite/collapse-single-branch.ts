import { orNode } from "../../ast/builders";
import { isLogicalNode } from "../../ast/guards";
import type { QueryNode } from "../../ast/types";
import type { ScopeSafetyPolicy } from "../safety/scope-safety-policy";

export function collapseSingleOrBranch(node: QueryNode, policy: ScopeSafetyPolicy): QueryNode {
    if (!policy.allowSingleBranchCollapse) {
        return node;
    }
    if (!isLogicalNode(node) || node.op !== "$or") {
        return node;
    }
    if (node.children.length !== 1) {
        return node;
    }
    return node.children[0];
}

export function collapseOrNodeChildren(children: QueryNode[], policy: ScopeSafetyPolicy): QueryNode {
    if (!policy.allowSingleBranchCollapse) {
        return orNode(children);
    }
    if (children.length === 1) {
        return children[0];
    }
    return orNode(children);
}
