import type {
    NodeStats,
    PredicateFieldTrace,
    ResolvedNormalizeOptions,
    ScopeTraceEvent,
} from "./types";
import type { ConstraintExtractionRejection } from "./scope/context/constraint-set";

export interface NormalizeContext {
    options: ResolvedNormalizeOptions;
    appliedRules: string[];
    skippedRules: string[];
    warnings: string[];
    bailedOut: boolean;
    bailoutReason?: string;
    beforeHash?: string;
    afterHash?: string;
    beforeStats?: NodeStats;
    afterStats?: NodeStats;
    depth: number;
    predicateTraces?: PredicateFieldTrace[];
    scopeTraceEvents?: ScopeTraceEvent[];
    scopeConstraintRejections?: ConstraintExtractionRejection[];
}

export function createNormalizeContext(options: ResolvedNormalizeOptions): NormalizeContext {
    return {
        options,
        appliedRules: [],
        skippedRules: [],
        warnings: [],
        bailedOut: false,
        bailoutReason: undefined,
        beforeHash: undefined,
        afterHash: undefined,
        beforeStats: undefined,
        afterStats: undefined,
        depth: 0,
        predicateTraces: undefined,
        scopeTraceEvents: undefined,
        scopeConstraintRejections: undefined,
    };
}
