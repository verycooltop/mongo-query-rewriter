import type { FieldPredicateBundle } from "./ir/field-predicate-bundle";
import type { PredicateAtom } from "./ir/predicate-atom";
import type { SkippedCapability } from "./planner/relation-plan";

export type LocalNormalizeResult = {
    normalizedBundle: FieldPredicateBundle;
    changed: boolean;
    contradiction: boolean;
    contradictionCapabilityId?: string;
    atomDedupeChanged: boolean;
    coveredAtoms: PredicateAtom[];
    skippedAtoms: PredicateAtom[];
    appliedCapabilities: string[];
    skippedCapabilities: SkippedCapability[];
    atomKinds: string[];
    warnings: string[];
};
