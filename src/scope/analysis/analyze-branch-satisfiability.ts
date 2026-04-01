import { isFieldNode } from "../../ast/guards";
import type { QueryNode } from "../../ast/types";
import { normalizeFieldPredicateBundle } from "../../predicate/normalize-field-predicate-bundle";
import type { ConstraintSet } from "../context/constraint-set";
import type { ScopeSafetyPolicy } from "../safety/scope-safety-policy";
import { createBranchLocalBundle } from "../propagation/create-branch-local-bundle";

export type BranchSatisfiabilityExplanation = {
    satisfiable: boolean;
    reason: string;
};

export function explainBranchSatisfiability(
    branch: QueryNode,
    inherited: ConstraintSet,
    policy: ScopeSafetyPolicy
): BranchSatisfiabilityExplanation {
    if (policy.bailoutOnUnsupportedScopeMix && inherited.metadata.hasUnsupportedSemantics) {
        return {
            satisfiable: true,
            reason: "preserve branch: inherited constraints marked unsupported/bailout",
        };
    }
    if (!isFieldNode(branch)) {
        return {
            satisfiable: true,
            reason: "non-field branch: no local+inherited contradiction check",
        };
    }
    const bundle = createBranchLocalBundle(branch, inherited);
    const local = normalizeFieldPredicateBundle(bundle, {});
    if (local.contradiction) {
        return {
            satisfiable: false,
            reason: `local analysis reports contradiction (capability ${local.contradictionCapabilityId ?? "unknown"})`,
        };
    }
    return {
        satisfiable: true,
        reason: "no contradiction between inherited constraints and branch field",
    };
}
