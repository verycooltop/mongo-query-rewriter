import type { NormalizeLevel, NormalizeObserve, NormalizeRules, NormalizeSafety } from "../types";

export const DEFAULT_LEVEL: NormalizeLevel = "shape";

export const DEFAULT_SAFETY: NormalizeSafety = {
    maxNormalizeDepth: 32,
    maxNodeGrowthRatio: 1.5,
};

export const DEFAULT_OBSERVE: NormalizeObserve = {
    collectWarnings: true,
    collectMetrics: false,
    collectPredicateTraces: false,
    collectScopeTraces: false,
};

const SORT_RULES: Pick<NormalizeRules, "sortLogicalChildren" | "sortFieldPredicates"> = {
    sortLogicalChildren: true,
    sortFieldPredicates: true,
};

const BASE_SHAPE_RULES: Pick<
    NormalizeRules,
    | "flattenLogical"
    | "removeEmptyLogical"
    | "collapseSingleChildLogical"
    | "dedupeLogicalChildren"
> = {
    flattenLogical: true,
    removeEmptyLogical: true,
    collapseSingleChildLogical: true,
    dedupeLogicalChildren: true,
};

const PREDICATE_RULES: Pick<
    NormalizeRules,
    "dedupeSameFieldPredicates" | "mergeComparablePredicates" | "collapseContradictions"
> = {
    dedupeSameFieldPredicates: true,
    mergeComparablePredicates: true,
    collapseContradictions: true,
};

/** Default extra rules when `level` is `scope` (includes `$or` common-predicate detection). */
const SCOPE_LEVEL_EXTRA: Pick<NormalizeRules, "detectCommonPredicatesInOr"> = {
    detectCommonPredicatesInOr: true,
};

function rulesForLevel(level: NormalizeLevel): NormalizeRules {
    const base: NormalizeRules = {
        ...BASE_SHAPE_RULES,
        dedupeSameFieldPredicates: false,
        mergeComparablePredicates: false,
        collapseContradictions: false,
        ...SORT_RULES,
        detectCommonPredicatesInOr: false,
    };

    if (level === "shape") {
        return base;
    }

    const withPredicate: NormalizeRules = {
        ...base,
        ...PREDICATE_RULES,
    };

    if (level === "predicate") {
        return withPredicate;
    }

    return {
        ...withPredicate,
        ...SCOPE_LEVEL_EXTRA,
    };
}

export const DEFAULT_RULES_BY_LEVEL: Record<NormalizeLevel, NormalizeRules> = {
    shape: rulesForLevel("shape"),
    predicate: rulesForLevel("predicate"),
    scope: rulesForLevel("scope"),
};
