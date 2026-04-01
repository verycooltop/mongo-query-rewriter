import type { QueryNode } from "../../ast/types";
import type { ConstraintSet } from "../context/constraint-set";
import { removeCoveredLocalConstraints } from "../rewrite/remove-covered-local-constraints";
import type { ScopeSafetyPolicy } from "../safety/scope-safety-policy";

export function analyzeBranchCoverage(
    branch: QueryNode,
    inherited: ConstraintSet,
    policy: ScopeSafetyPolicy
): QueryNode {
    return removeCoveredLocalConstraints(branch, inherited, policy);
}
