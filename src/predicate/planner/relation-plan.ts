import type { PredicateCapability } from "../capabilities/shared/capability-types";

export type SkippedCapability = {
    id: string;
    reason: string;
};

export type RelationPlan = {
    capabilities: PredicateCapability[];
    skippedCapabilities: SkippedCapability[];
};
