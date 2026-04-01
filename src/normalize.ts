import { hashNode } from "./ast/hash";
import type { QueryNode } from "./ast/types";
import { compileQuery } from "./compile/compile";
import type { NormalizeContext } from "./normalize-context";
import { createNormalizeContext } from "./normalize-context";
import { collectNodeStats } from "./observe/metrics";
import { addWarning } from "./observe/warnings";
import { resolveNormalizeOptions } from "./options/resolve";
import { canonicalize } from "./passes/canonicalize";
import { normalizePredicate } from "./passes/normalize-predicate";
import { normalizeShape } from "./passes/normalize-shape";
import { simplify } from "./passes/simplify";
import { normalizeScope } from "./scope/normalize-scope";
import { parseQuery } from "./parse/parse";
import { detectCommonPredicatesInOr } from "./rules/or-common-predicate/detect-common-predicates-in-or";
import type { NormalizeMeta, NormalizeOptions, NormalizeResult, Query } from "./types";

/**
 * 主入口：parse →（shape / predicate / scope 直至稳定）→（scope 下可选 observe-only 的 detectCommonPredicatesInOr）→ canonicalize → compile。
 */
export function normalizeQuery(query: Query, options?: NormalizeOptions): NormalizeResult {
    const normalizeContext = createNormalizeContext(resolveNormalizeOptions(options));

    const beforeNode = parseQuery(query, normalizeContext);
    recordBeforeObservation(normalizeContext, beforeNode);

    let workingNode = beforeNode;
    workingNode = runNormalizePipeline(workingNode, normalizeContext);

    const afterNode = normalizeContext.bailedOut ? beforeNode : workingNode;
    recordAfterObservation(normalizeContext, afterNode);

    const finalQuery = compileQuery(afterNode, normalizeContext);

    return buildNormalizeResult(query, finalQuery, beforeNode, afterNode, normalizeContext);
}

function recordBeforeObservation(normalizeContext: NormalizeContext, node: QueryNode): void {
    if (normalizeContext.options.observe.collectMetrics) {
        normalizeContext.beforeStats = collectNodeStats(node);
    }
    normalizeContext.beforeHash = hashNode(node);
}

function recordAfterObservation(normalizeContext: NormalizeContext, node: QueryNode): void {
    if (normalizeContext.options.observe.collectMetrics) {
        normalizeContext.afterStats = collectNodeStats(node);
    }
    normalizeContext.afterHash = hashNode(node);
}

const MAX_NORMALIZE_STABLE_ROUNDS = 8;

function runStabilizationPhases(
    node: QueryNode,
    normalizeContext: NormalizeContext,
    root: QueryNode,
    shouldRunPredicate: boolean,
    shouldRunScope: boolean,
    emitInnerNonConvergeWarnings: boolean
): QueryNode {
    let n = node;

    {
        let shapeConverged = false;
        for (let r = 0; r < MAX_NORMALIZE_STABLE_ROUNDS; r++) {
            const beforeRound = hashNode(n);
            n = normalizeShape(n, normalizeContext);
            if (normalizeContext.bailedOut) {
                return root;
            }
            if (hashNode(n) === beforeRound) {
                shapeConverged = true;
                break;
            }
        }
        if (!shapeConverged && emitInnerNonConvergeWarnings) {
            addWarning(
                normalizeContext,
                `[mongo-query-normalizer] shape normalization did not reach a fixed point within ${MAX_NORMALIZE_STABLE_ROUNDS} internal rounds`
            );
        }
    }

    if (shouldRunPredicate) {
        let predicateConverged = false;
        for (let r = 0; r < MAX_NORMALIZE_STABLE_ROUNDS; r++) {
            const beforeRound = hashNode(n);
            n = normalizePredicate(n, normalizeContext);
            if (normalizeContext.bailedOut) {
                return root;
            }
            n = simplify(n, normalizeContext);
            if (normalizeContext.bailedOut) {
                return root;
            }
            if (hashNode(n) === beforeRound) {
                predicateConverged = true;
                break;
            }
        }
        if (!predicateConverged && emitInnerNonConvergeWarnings) {
            addWarning(
                normalizeContext,
                `[mongo-query-normalizer] predicate normalization (with simplify) did not reach a fixed point within ${MAX_NORMALIZE_STABLE_ROUNDS} internal rounds`
            );
        }
    }

    if (shouldRunScope) {
        let scopeConverged = false;
        for (let r = 0; r < MAX_NORMALIZE_STABLE_ROUNDS; r++) {
            const beforeRound = hashNode(n);
            n = normalizeScope(n, normalizeContext);
            if (normalizeContext.bailedOut) {
                return root;
            }
            n = simplify(n, normalizeContext);
            if (normalizeContext.bailedOut) {
                return root;
            }
            if (hashNode(n) === beforeRound) {
                scopeConverged = true;
                break;
            }
        }
        if (!scopeConverged && emitInnerNonConvergeWarnings) {
            addWarning(
                normalizeContext,
                `[mongo-query-normalizer] scope normalization (with simplify) did not reach a fixed point within ${MAX_NORMALIZE_STABLE_ROUNDS} internal rounds`
            );
        }
    }

    return canonicalize(n, normalizeContext);
}

function runNormalizePipeline(root: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    let node = root;

    const shouldRunPredicate =
        normalizeContext.options.level === "predicate" || normalizeContext.options.level === "scope";

    const shouldRunScope = normalizeContext.options.level === "scope";

    let outerReachedFixedPoint = false;

    for (let o = 0; o < MAX_NORMALIZE_STABLE_ROUNDS; o++) {
        const outerStart = hashNode(node);

        node = runStabilizationPhases(
            node,
            normalizeContext,
            root,
            shouldRunPredicate,
            shouldRunScope,
            true
        );
        if (normalizeContext.bailedOut) {
            return root;
        }

        if (hashNode(node) === outerStart) {
            outerReachedFixedPoint = true;
            break;
        }
    }

    if (!outerReachedFixedPoint && !normalizeContext.bailedOut) {
        addWarning(
            normalizeContext,
            `[mongo-query-normalizer] normalize pipeline did not reach an outer fixed point within ${MAX_NORMALIZE_STABLE_ROUNDS} outer rounds`
        );
    }

    if (!normalizeContext.bailedOut) {
        node = parseQuery(compileQuery(node, normalizeContext), normalizeContext);
        node = runStabilizationPhases(
            node,
            normalizeContext,
            root,
            shouldRunPredicate,
            shouldRunScope,
            false
        );
        if (normalizeContext.bailedOut) {
            return root;
        }
    }

    if (normalizeContext.options.level === "scope" && normalizeContext.options.rules.detectCommonPredicatesInOr) {
        node = detectCommonPredicatesInOr(node, normalizeContext);
        if (normalizeContext.bailedOut) {
            return root;
        }
    }

    node = canonicalize(node, normalizeContext);

    return node;
}

function buildNormalizeResult(
    _originalQuery: Query,
    finalQuery: Query,
    _beforeNode: QueryNode,
    _afterNode: QueryNode,
    normalizeContext: NormalizeContext
): NormalizeResult {
    const changed = normalizeContext.beforeHash !== normalizeContext.afterHash;

    const meta: NormalizeMeta = {
        changed,
        level: normalizeContext.options.level,
        appliedRules: normalizeContext.appliedRules,
        skippedRules: normalizeContext.skippedRules,
        warnings: normalizeContext.warnings,
        bailedOut: normalizeContext.bailedOut,
        bailoutReason: normalizeContext.bailoutReason,
        beforeHash: normalizeContext.beforeHash,
        afterHash: normalizeContext.afterHash,
        stats:
            normalizeContext.options.observe.collectMetrics && normalizeContext.beforeStats && normalizeContext.afterStats
                ? {
                    before: normalizeContext.beforeStats,
                    after: normalizeContext.afterStats,
                }
                : undefined,
    };

    if (normalizeContext.options.observe.collectPredicateTraces) {
        meta.predicateTraces = [...(normalizeContext.predicateTraces ?? [])];
    }
    if (normalizeContext.options.observe.collectScopeTraces) {
        meta.scopeTrace = {
            constraintRejections: [...(normalizeContext.scopeConstraintRejections ?? [])],
            events: [...(normalizeContext.scopeTraceEvents ?? [])],
        };
    }

    return {
        query: finalQuery,
        meta,
    };
}
