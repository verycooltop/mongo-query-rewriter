export type { PredicateAtom } from "./ir/predicate-atom";
export type { FieldPredicateBundle, FieldPredicateBundleMetadata } from "./ir/field-predicate-bundle";
export { buildFieldPredicateBundleFromFieldNode, cloneBundle, refreshBundleMetadata } from "./ir/build-field-bundle";
export { compileFieldPredicateBundleToAst } from "./ir/compile-field-bundle";
export type { LocalNormalizeResult } from "./local-normalize-result";
export {
    normalizeFieldPredicateBundle,
    detectLocalContradiction,
    detectLocalCoverage,
    analyzeFieldPredicateBundle,
    compileLocalNormalizeResultToAst,
    type NormalizeFieldPredicateBundleOptions,
} from "./normalize-field-predicate-bundle";
export { DEFAULT_PREDICATE_SAFETY_POLICY, type PredicateSafetyPolicy } from "./safety/predicate-safety-policy";
export { getDefaultPredicateCapabilities } from "./registry/predicate-capability-registry";
export type { PredicateCapability } from "./capabilities/shared/capability-types";
export type { RelationContext, PredicateEngineFlags } from "./capabilities/shared/relation-context";
export { planRelations } from "./planner/relation-planner";
