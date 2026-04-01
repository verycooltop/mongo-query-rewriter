import type { NormalizeLevel, NormalizeOptions, ResolvedNormalizeOptions } from "../types";
import {
    DEFAULT_PREDICATE_SAFETY_POLICY,
    type PredicateSafetyPolicy,
} from "../predicate/safety/predicate-safety-policy";
import { DEFAULT_SCOPE_SAFETY_POLICY, type ScopeSafetyPolicy } from "../scope/safety/scope-safety-policy";
import {
    DEFAULT_LEVEL,
    DEFAULT_OBSERVE,
    DEFAULT_RULES_BY_LEVEL,
    DEFAULT_SAFETY,
} from "./constants";

function mergePredicateSafetyPolicy(partial?: Partial<PredicateSafetyPolicy>): PredicateSafetyPolicy {
    return {
        ...DEFAULT_PREDICATE_SAFETY_POLICY,
        ...(partial ?? {}),
    };
}

function mergeScopeSafetyPolicy(partial?: Partial<ScopeSafetyPolicy>): ScopeSafetyPolicy {
    const merged: ScopeSafetyPolicy = { ...DEFAULT_SCOPE_SAFETY_POLICY };
    if (!partial) {
        return merged;
    }
    for (const key of Object.keys(DEFAULT_SCOPE_SAFETY_POLICY) as (keyof ScopeSafetyPolicy)[]) {
        if (Object.prototype.hasOwnProperty.call(partial, key)) {
            merged[key] = partial[key]!;
        }
    }
    return merged;
}

export function resolveNormalizeOptions(options?: NormalizeOptions): ResolvedNormalizeOptions {
    const level = resolveLevel(options?.level);

    return {
        level,
        rules: mergeRules(level, options?.rules),
        safety: mergeSafety(options?.safety),
        observe: mergeObserve(options?.observe),
        predicate: {
            safetyPolicy: mergePredicateSafetyPolicy(options?.predicate?.safetyPolicy),
        },
        scope: {
            safetyPolicy: mergeScopeSafetyPolicy(options?.scope?.safetyPolicy),
        },
    };
}

function resolveLevel(level?: NormalizeOptions["level"]): NormalizeLevel {
    const resolved = level ?? DEFAULT_LEVEL;
    if (Object.prototype.hasOwnProperty.call(DEFAULT_RULES_BY_LEVEL, resolved)) {
        return resolved;
    }
    const allowed = Object.keys(DEFAULT_RULES_BY_LEVEL).join(", ");
    throw new Error(
        `[mongo-query-normalizer] invalid normalize level: ${JSON.stringify(level)}. Expected one of: ${allowed}.`
    );
}

function mergeRules(level: NormalizeLevel, rules?: Partial<ResolvedNormalizeOptions["rules"]>) {
    return {
        ...DEFAULT_RULES_BY_LEVEL[level],
        ...(rules ?? {}),
    };
}

function mergeSafety(safety?: Partial<ResolvedNormalizeOptions["safety"]>) {
    return {
        ...DEFAULT_SAFETY,
        ...(safety ?? {}),
    };
}

function mergeObserve(observe?: Partial<ResolvedNormalizeOptions["observe"]>) {
    return {
        ...DEFAULT_OBSERVE,
        ...(observe ?? {}),
    };
}
