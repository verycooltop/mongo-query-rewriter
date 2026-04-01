import type { PredicateSafetyPolicy } from "./predicate/safety/predicate-safety-policy";
import type { ScopeSafetyPolicy } from "./scope/safety/scope-safety-policy";
import type { ConstraintExtractionRejection } from "./scope/context/constraint-set";

/**
 * MongoDB 查询对象（规范化入口的输入/输出形状）
 */
export type Query = Record<string, unknown>;

export type NormalizeLevel = "shape" | "predicate" | "scope";

export interface NormalizeRules {
    flattenLogical: boolean;
    removeEmptyLogical: boolean;
    collapseSingleChildLogical: boolean;
    dedupeLogicalChildren: boolean;
    dedupeSameFieldPredicates: boolean;
    mergeComparablePredicates: boolean;
    collapseContradictions: boolean;
    sortLogicalChildren: boolean;
    sortFieldPredicates: boolean;
    detectCommonPredicatesInOr: boolean;
}

export interface NormalizeSafety {
    maxNormalizeDepth: number;
    maxNodeGrowthRatio: number;
}

export interface NormalizeObserve {
    collectWarnings: boolean;
    collectMetrics: boolean;
    /** When true, `meta.predicateTraces` lists per-field planner and skip signals. */
    collectPredicateTraces: boolean;
    /** When true, `meta.scopeTrace` records propagation / prune / coverage decisions. */
    collectScopeTraces: boolean;
}

export interface NormalizePredicateOptions {
    safetyPolicy: PredicateSafetyPolicy;
}

export interface NormalizeScopeLayerOptions {
    safetyPolicy: ScopeSafetyPolicy;
}

export interface NormalizeOptions {
    level?: NormalizeLevel;
    rules?: Partial<NormalizeRules>;
    safety?: Partial<NormalizeSafety>;
    observe?: Partial<NormalizeObserve>;
    predicate?: {
        safetyPolicy?: Partial<PredicateSafetyPolicy>;
    };
    scope?: {
        safetyPolicy?: Partial<ScopeSafetyPolicy>;
    };
}

export interface ResolvedNormalizeOptions {
    level: NormalizeLevel;
    rules: NormalizeRules;
    safety: NormalizeSafety;
    observe: NormalizeObserve;
    predicate: NormalizePredicateOptions;
    scope: NormalizeScopeLayerOptions;
}

export interface NodeStats {
    nodeCount: number;
    maxDepth: number;
    andCount: number;
    orCount: number;
}

/** 对外名称：`meta.stats` 中 before/after 的树统计。 */
export type NormalizeStats = NodeStats;

export type PredicateCapabilitySkipTrace = {
    id: string;
    reason: string;
};

export type PredicateFieldTrace = {
    field: string;
    atomKinds: string[];
    appliedCapabilityIds: string[];
    skippedCapabilities: PredicateCapabilitySkipTrace[];
    contradiction: boolean;
    /** When set, identifies the capability that first reported local contradiction. */
    contradictionCapabilityId?: string;
    hadCoverage: boolean;
    /** Number of predicate atoms removed as redundant (same round). */
    coverageAtomCount: number;
    hadTighten: boolean;
    /** True when this field normalized to an unsatisfiable selector (FalseNode → IMPOSSIBLE_SELECTOR). */
    impossibleEmitted: boolean;
};

export type ScopeTraceEvent =
    | {
          type: "or-branch-inherited";
          satisfiabilityCheck: "skipped" | "ran";
          satisfiable?: boolean;
          detail: string;
      }
    | {
          type: "prune-branch";
          outcome: "pruned-to-false" | "skipped-by-policy";
          detail: string;
      }
    | {
          type: "coverage-removal";
          outcome: "replaced-with-true" | "unchanged";
          detail: string;
      }
    | {
          type: "collapse-or";
          outcome: "collapsed-single-child" | "unchanged";
          detail: string;
      }
    | {
          type: "and-propagation";
          outcome: "applied" | "skipped-by-policy";
          detail: string;
      };

export type ScopeNormalizationTrace = {
    constraintRejections: ConstraintExtractionRejection[];
    events: ScopeTraceEvent[];
};

export interface NormalizeMeta {
    changed: boolean;
    level: NormalizeLevel;
    appliedRules: string[];
    skippedRules: string[];
    warnings: string[];
    bailedOut: boolean;
    bailoutReason?: string;
    beforeHash?: string;
    afterHash?: string;
    stats?: {
        before: NodeStats;
        after: NodeStats;
    };
    predicateTraces?: PredicateFieldTrace[];
    scopeTrace?: ScopeNormalizationTrace;
}

export interface NormalizeResult<Q = Query> {
    query: Q;
    meta: NormalizeMeta;
}

/**
 * FalseNode 编译结果：不可满足选择器（与设计文档一致）
 */
/** Canonical unsatisfiable filter: no document has a missing top-level `_id` in normal collections. */
export const IMPOSSIBLE_SELECTOR: Query = { _id: { $exists: false } } as Query;
