import {
    isRangeAtom,
    mergeRangeBoundsFromRangeAtoms,
    mergedBoundsContradict,
    valueSatisfiesMergedRange,
    type RangeLower,
    type RangeUpper,
} from "../../analysis/merge-range-bounds";
import { refreshBundleMetadata } from "../../ir/build-field-bundle";
import type { PredicateAtom } from "../../ir/predicate-atom";
import type { PredicateCapability } from "../shared/capability-types";
import type { RelationContext } from "../shared/relation-context";
import { emptyRelationResult, type RelationResult } from "../shared/relation-result";
import { intersectInAtomValues } from "../../utils/intersect-in-lists";
import { uniqueUnknownArray } from "../../utils/set-ops";
import { valuesEqual } from "../../utils/value-equality";
import { isComparableScalar } from "../../utils/bson-compare";

function rangeAtomFromLower(lower: RangeLower): PredicateAtom {
    if (lower.kind === "gt") {
        return { kind: "gt", value: lower.value };
    }
    return { kind: "gte", value: lower.value };
}

function rangeAtomFromUpper(upper: RangeUpper): PredicateAtom {
    if (upper.kind === "lt") {
        return { kind: "lt", value: upper.value };
    }
    return { kind: "lte", value: upper.value };
}

function inValuesSameSet(a: unknown[], b: unknown[]): boolean {
    const ua = uniqueUnknownArray(a);
    const ub = uniqueUnknownArray(b);
    if (ua.length !== ub.length) {
        return false;
    }
    return ua.every((v) => ub.some((w) => valuesEqual(v, w)));
}

export const eqRangeCapability: PredicateCapability = {
    id: "eq.range",
    description: "Detect impossible $eq/$in vs range combinations; tighten or drop redundant bounds",
    riskLevel: "safe",
    supportedAtomKinds: ["eq", "in", "gt", "gte", "lt", "lte"],
    isApplicable(ctx: RelationContext): boolean {
        if (!ctx.engine.mergeComparable && !ctx.engine.collapseContradictions) {
            return false;
        }
        const hasEq = ctx.bundle.predicates.some((a) => a.kind === "eq");
        const hasIn = ctx.bundle.predicates.some((a) => a.kind === "in");
        const hasRange = ctx.bundle.predicates.some(isRangeAtom);
        return (hasEq && hasRange) || (hasIn && hasRange);
    },
    apply(ctx: RelationContext): RelationResult {
        const base = emptyRelationResult(ctx.bundle);
        const predicates = ctx.bundle.predicates;
        const rangeAtoms = predicates.filter(isRangeAtom);
        const inAtoms = predicates.filter((a): a is Extract<PredicateAtom, { kind: "in" }> => a.kind === "in");
        const otherAtoms = predicates.filter((a) => !isRangeAtom(a) && a.kind !== "in");

        if (rangeAtoms.length === 0) {
            return base;
        }

        const merged = mergeRangeBoundsFromRangeAtoms(rangeAtoms);

        if (mergedBoundsContradict(merged.lower, merged.upper)) {
            return { ...base, contradiction: true, changed: true };
        }

        const eq = otherAtoms.find((a): a is Extract<PredicateAtom, { kind: "eq" }> => a.kind === "eq");

        if (eq && eq.kind === "eq") {
            if (!isComparableScalar(eq.value)) {
                return {
                    ...base,
                    skippedAtoms: [eq],
                    warnings: [`field ${ctx.bundle.fieldPath}: $eq is not comparable with range`],
                };
            }
            if (ctx.engine.collapseContradictions && !valueSatisfiesMergedRange(eq.value, merged.lower, merged.upper)) {
                return { ...base, contradiction: true, changed: true };
            }
        }

        let changed = false;
        const coveredAtoms: PredicateAtom[] = [];
        let nextInAtoms = inAtoms;
        let shouldDropRanges = false;
        let inTightened = false;

        if (
            inAtoms.length > 0 &&
            !merged.skippedNonComparableRange &&
            (ctx.engine.mergeComparable || ctx.engine.collapseContradictions)
        ) {
            const intersected =
                inAtoms.length === 1 ? [...inAtoms[0].values] : intersectInAtomValues(inAtoms);
            const allComparable = intersected.length > 0 && intersected.every(isComparableScalar);
            if (allComparable) {
                const filtered = intersected.filter((v) => valueSatisfiesMergedRange(v, merged.lower, merged.upper));
                if (filtered.length === 0 && intersected.length > 0 && ctx.engine.collapseContradictions) {
                    return { ...base, contradiction: true, changed: true };
                }
                if (ctx.engine.mergeComparable && filtered.length > 0) {
                    const uniqFiltered = uniqueUnknownArray(filtered);
                    inTightened =
                        inAtoms.length > 1 ||
                        (inAtoms.length === 1 && !inValuesSameSet(inAtoms[0].values, uniqFiltered));
                    if (inTightened) {
                        nextInAtoms = [{ kind: "in", values: uniqFiltered }];
                        coveredAtoms.push(...inAtoms);
                    }
                    shouldDropRanges = true;
                    changed = true;
                }
            }
        }

        if (
            ctx.engine.mergeComparable &&
            eq &&
            eq.kind === "eq" &&
            isComparableScalar(eq.value) &&
            valueSatisfiesMergedRange(eq.value, merged.lower, merged.upper)
        ) {
            shouldDropRanges = true;
            changed = true;
        }

        if (!changed) {
            return base;
        }

        if (shouldDropRanges) {
            coveredAtoms.push(...rangeAtoms);
        }

        const rangeOut: PredicateAtom[] = [];
        if (!shouldDropRanges) {
            if (merged.lower) {
                rangeOut.push(rangeAtomFromLower(merged.lower));
            }
            if (merged.upper) {
                rangeOut.push(rangeAtomFromUpper(merged.upper));
            }
        }

        const nextPredicates = [...otherAtoms, ...nextInAtoms, ...rangeOut];
        const bundle = refreshBundleMetadata({
            ...ctx.bundle,
            predicates: nextPredicates,
        });

        return {
            bundle,
            changed: true,
            contradiction: false,
            coveredAtoms,
            skippedAtoms: [],
            warnings: [],
        };
    },
};
