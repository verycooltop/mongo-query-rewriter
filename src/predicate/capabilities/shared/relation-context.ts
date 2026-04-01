import type { FieldPredicateBundle } from "../../ir/field-predicate-bundle";
import type { PredicateSafetyPolicy } from "../../safety/predicate-safety-policy";

export type PredicateEngineFlags = {
    dedupeAtoms: boolean;
    mergeComparable: boolean;
    collapseContradictions: boolean;
};

export type RelationContext = {
    bundle: FieldPredicateBundle;
    safety: PredicateSafetyPolicy;
    engine: PredicateEngineFlags;
};
