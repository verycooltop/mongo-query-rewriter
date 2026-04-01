export type ScopeSafetyPolicy = {
    allowBranchPruning: boolean;
    allowConstraintCoverageElimination: boolean;
    allowSingleBranchCollapse: boolean;
    allowOrPropagation: boolean;
    allowAndPropagation: boolean;
    bailoutOnUnsupportedScopeMix: boolean;
};

export const DEFAULT_SCOPE_SAFETY_POLICY: ScopeSafetyPolicy = {
    allowBranchPruning: true,
    allowConstraintCoverageElimination: true,
    allowSingleBranchCollapse: true,
    allowOrPropagation: true,
    allowAndPropagation: true,
    bailoutOnUnsupportedScopeMix: true,
};
