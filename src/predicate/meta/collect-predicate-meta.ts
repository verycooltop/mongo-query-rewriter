import type { LocalNormalizeResult } from "../local-normalize-result";

export type PredicateNormalizeMeta = {
    appliedCapabilities: string[];
    skippedCapabilityReasons: { id: string; reason: string }[];
    warnings: string[];
    contradiction: boolean;
    changed: boolean;
};

export function collectPredicateMeta(
    result: LocalNormalizeResult,
    skippedFromPlanner: { id: string; reason: string }[]
): PredicateNormalizeMeta {
    return {
        appliedCapabilities: result.appliedCapabilities,
        skippedCapabilityReasons: skippedFromPlanner,
        warnings: result.warnings,
        contradiction: result.contradiction,
        changed: result.changed,
    };
}
