import type { QueryNode } from "../ast/types";
import { refreshBundleMetadata, detectUnsupportedMix } from "./ir/build-field-bundle";
import { compileFieldPredicateBundleToAst } from "./ir/compile-field-bundle";
import { dedupePredicateAtoms } from "./ir/dedupe-atoms";
import type { FieldPredicateBundle } from "./ir/field-predicate-bundle";
import type { LocalNormalizeResult } from "./local-normalize-result";
import { planRelations } from "./planner/relation-planner";
import { getDefaultPredicateCapabilities } from "./registry/predicate-capability-registry";
import type { SkippedCapability } from "./planner/relation-plan";
import type { PredicateSafetyPolicy } from "./safety/predicate-safety-policy";
import { DEFAULT_PREDICATE_SAFETY_POLICY } from "./safety/predicate-safety-policy";
import type { RelationContext } from "./capabilities/shared/relation-context";

export type NormalizeFieldPredicateBundleOptions = {
    safety?: PredicateSafetyPolicy;
    engine?: {
        dedupeAtoms: boolean;
        mergeComparable: boolean;
        collapseContradictions: boolean;
    };
};

function buildContext(
    bundle: FieldPredicateBundle,
    safety: PredicateSafetyPolicy,
    engine: RelationContext["engine"]
): RelationContext {
    return { bundle, safety, engine };
}

export function normalizeFieldPredicateBundle(
    bundle: FieldPredicateBundle,
    options?: NormalizeFieldPredicateBundleOptions
): LocalNormalizeResult {
    const safety = options?.safety ?? DEFAULT_PREDICATE_SAFETY_POLICY;
    const engine = options?.engine ?? {
        dedupeAtoms: true,
        mergeComparable: true,
        collapseContradictions: true,
    };
    let working = refreshBundleMetadata(bundle);
    const atomKinds = working.predicates.map((a) => a.kind);

    const appliedCapabilities: string[] = [];
    const coveredAtoms: import("./ir/predicate-atom").PredicateAtom[] = [];
    const skippedAtoms: import("./ir/predicate-atom").PredicateAtom[] = [];
    const warnings: string[] = [];
    let changed = false;

    let atomDedupeChanged = false;
    if (engine.dedupeAtoms && !(safety.bailoutOnUnsupportedMix && detectUnsupportedMix(working))) {
        const deduped = dedupePredicateAtoms(working.predicates);
        if (deduped.changed) {
            changed = true;
            atomDedupeChanged = true;
            working = refreshBundleMetadata({ ...working, predicates: deduped.next });
        }
    }

    if (safety.bailoutOnUnsupportedMix && detectUnsupportedMix(working)) {
        const caps = getDefaultPredicateCapabilities();
        const skippedCapabilities: SkippedCapability[] = caps.map((c) => ({
            id: c.id,
            reason: "unsupported opaque mix in bundle",
        }));
        return {
            normalizedBundle: working,
            changed,
            contradiction: false,
            contradictionCapabilityId: undefined,
            atomDedupeChanged,
            coveredAtoms,
            skippedAtoms,
            appliedCapabilities,
            skippedCapabilities,
            atomKinds,
            warnings,
        };
    }

    const caps = getDefaultPredicateCapabilities();
    const ctx0 = buildContext(working, safety, engine);
    const plan = planRelations(caps, ctx0);

    for (const cap of plan.capabilities) {
        const ctx = buildContext(working, safety, engine);
        if (!cap.isApplicable(ctx)) {
            continue;
        }
        const result = cap.apply(ctx);
        working = refreshBundleMetadata(result.bundle);
        if (result.warnings.length > 0) {
            warnings.push(...result.warnings);
        }
        if (result.skippedAtoms.length > 0) {
            skippedAtoms.push(...result.skippedAtoms);
        }
        if (result.coveredAtoms.length > 0) {
            coveredAtoms.push(...result.coveredAtoms);
        }
        if (result.contradiction) {
            appliedCapabilities.push(cap.id);
            return {
                normalizedBundle: working,
                changed: true,
                contradiction: true,
                contradictionCapabilityId: cap.id,
                atomDedupeChanged,
                coveredAtoms,
                skippedAtoms,
                appliedCapabilities,
                skippedCapabilities: plan.skippedCapabilities,
                atomKinds,
                warnings,
            };
        }
        if (result.changed) {
            changed = true;
            appliedCapabilities.push(cap.id);
        }
    }

    return {
        normalizedBundle: working,
        changed,
        contradiction: false,
        contradictionCapabilityId: undefined,
        atomDedupeChanged,
        coveredAtoms,
        skippedAtoms,
        appliedCapabilities,
        skippedCapabilities: plan.skippedCapabilities,
        atomKinds,
        warnings,
    };
}

export function detectLocalContradiction(
    bundle: FieldPredicateBundle,
    options?: NormalizeFieldPredicateBundleOptions
): boolean {
    return normalizeFieldPredicateBundle(bundle, options).contradiction;
}

export function detectLocalCoverage(
    bundle: FieldPredicateBundle,
    options?: NormalizeFieldPredicateBundleOptions
): import("./ir/predicate-atom").PredicateAtom[] {
    return normalizeFieldPredicateBundle(bundle, options).coveredAtoms;
}

export function analyzeFieldPredicateBundle(
    bundle: FieldPredicateBundle,
    options?: NormalizeFieldPredicateBundleOptions
): LocalNormalizeResult {
    return normalizeFieldPredicateBundle(bundle, options);
}

export function compileLocalNormalizeResultToAst(result: LocalNormalizeResult): QueryNode {
    return compileFieldPredicateBundleToAst(result.normalizedBundle, result.contradiction);
}
