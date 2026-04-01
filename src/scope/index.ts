export { normalizeScope } from "./normalize-scope";
export type { ConstraintSet } from "./context/constraint-set";
export { emptyConstraintSet, cloneConstraintSet } from "./context/constraint-set";
export { mergeConstraintSources, mergeManyConstraintSources } from "./context/merge-constraint-sources";
export { constraintSetFromQueryNode, constraintSetFromFieldNode } from "./context/build-inherited-constraints";
export { createBranchLocalBundle } from "./propagation/create-branch-local-bundle";
export { DEFAULT_SCOPE_SAFETY_POLICY, type ScopeSafetyPolicy } from "./safety/scope-safety-policy";
