import { falseNode } from "../../ast/builders";
import type { QueryNode } from "../../ast/types";
import type { ScopeTraceEvent } from "../../types";
import type { ConstraintSet } from "../context/constraint-set";
import type { ScopeSafetyPolicy } from "../safety/scope-safety-policy";
import { explainBranchSatisfiability } from "../analysis/analyze-branch-satisfiability";

export function pruneImpossibleOrBranch(
    branch: QueryNode,
    inherited: ConstraintSet,
    policy: ScopeSafetyPolicy,
    onTrace?: (event: ScopeTraceEvent) => void
): QueryNode | null {
    if (!policy.allowBranchPruning || !policy.allowOrPropagation) {
        onTrace?.({
            type: "prune-branch",
            outcome: "skipped-by-policy",
            detail: "branch pruning or $or propagation disabled by scope safety policy",
        });
        return null;
    }
    const explained = explainBranchSatisfiability(branch, inherited, policy);
    onTrace?.({
        type: "or-branch-inherited",
        satisfiabilityCheck: "ran",
        satisfiable: explained.satisfiable,
        detail: explained.reason,
    });
    if (!explained.satisfiable) {
        onTrace?.({
            type: "prune-branch",
            outcome: "pruned-to-false",
            detail: explained.reason,
        });
        return falseNode();
    }
    return null;
}
