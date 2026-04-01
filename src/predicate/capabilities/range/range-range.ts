import { refreshBundleMetadata } from "../../ir/build-field-bundle";
import type { PredicateAtom } from "../../ir/predicate-atom";
import type { PredicateCapability } from "../shared/capability-types";
import type { RelationContext } from "../shared/relation-context";
import { emptyRelationResult, type RelationResult } from "../shared/relation-result";
import { compareScalarValues, isComparableScalar } from "../../utils/bson-compare";

type RangeLower = { kind: "gt" | "gte"; value: unknown };
type RangeUpper = { kind: "lt" | "lte"; value: unknown };

function toRangeLower(atom: PredicateAtom): RangeLower | null {
    if (atom.kind === "gt" || atom.kind === "gte") {
        return { kind: atom.kind, value: atom.value };
    }
    return null;
}

function toRangeUpper(atom: PredicateAtom): RangeUpper | null {
    if (atom.kind === "lt" || atom.kind === "lte") {
        return { kind: atom.kind, value: atom.value };
    }
    return null;
}

function chooseStrongerLowerBound(lower: RangeLower | null, p: RangeLower): RangeLower {
    if (!lower) {
        return p;
    }
    const cmp = compareScalarValues(p.value, lower.value);
    if (cmp === null) {
        return lower;
    }
    if (cmp > 0) {
        return p;
    }
    if (cmp < 0) {
        return lower;
    }
    if (p.kind === "gt" && lower.kind === "gte") {
        return p;
    }
    if (p.kind === "gte" && lower.kind === "gt") {
        return lower;
    }
    return lower;
}

function chooseStrongerUpperBound(upper: RangeUpper | null, p: RangeUpper): RangeUpper {
    if (!upper) {
        return p;
    }
    const cmp = compareScalarValues(p.value, upper.value);
    if (cmp === null) {
        return upper;
    }
    if (cmp < 0) {
        return p;
    }
    if (cmp > 0) {
        return upper;
    }
    if (p.kind === "lt" && upper.kind === "lte") {
        return p;
    }
    if (p.kind === "lte" && upper.kind === "lt") {
        return upper;
    }
    return upper;
}

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

export const rangeRangeCapability: PredicateCapability = {
    id: "range.range",
    description: "Merge multiple range bounds on the same field",
    riskLevel: "safe",
    supportedAtomKinds: ["gt", "gte", "lt", "lte"],
    isApplicable(ctx: RelationContext): boolean {
        if (!ctx.engine.mergeComparable && !ctx.engine.collapseContradictions) {
            return false;
        }
        const rangeCount = ctx.bundle.predicates.filter(
            (a) => a.kind === "gt" || a.kind === "gte" || a.kind === "lt" || a.kind === "lte"
        ).length;
        return rangeCount >= 2;
    },
    apply(ctx: RelationContext): RelationResult {
        const base = emptyRelationResult(ctx.bundle);
        let lower: RangeLower | null = null;
        let upper: RangeUpper | null = null;
        const others: PredicateAtom[] = [];

        for (const p of ctx.bundle.predicates) {
            const asLower = toRangeLower(p);
            if (asLower) {
                if (!isComparableScalar(asLower.value)) {
                    return {
                        ...base,
                        warnings: [`field ${ctx.bundle.fieldPath}: predicate ${asLower.kind} is not comparable`],
                        skippedAtoms: [p],
                    };
                }
                lower = chooseStrongerLowerBound(lower, asLower);
                continue;
            }
            const asUpper = toRangeUpper(p);
            if (asUpper) {
                if (!isComparableScalar(asUpper.value)) {
                    return {
                        ...base,
                        warnings: [`field ${ctx.bundle.fieldPath}: predicate ${asUpper.kind} is not comparable`],
                        skippedAtoms: [p],
                    };
                }
                upper = chooseStrongerUpperBound(upper, asUpper);
                continue;
            }
            others.push(p);
        }

        if (lower && upper) {
            const cmp = compareScalarValues(lower.value, upper.value);
            if (cmp === 1) {
                return { ...base, contradiction: true, changed: true };
            }
            if (cmp === 0 && (lower.kind === "gt" || upper.kind === "lt")) {
                return { ...base, contradiction: true, changed: true };
            }
        }

        const hadMultipleRange =
            ctx.bundle.predicates.filter(
                (a) => a.kind === "gt" || a.kind === "gte" || a.kind === "lt" || a.kind === "lte"
            ).length >= 2;

        if (!hadMultipleRange) {
            return base;
        }

        const mergedRange: PredicateAtom[] = [];
        if (lower) {
            mergedRange.push(rangeAtomFromLower(lower));
        }
        if (upper) {
            mergedRange.push(rangeAtomFromUpper(upper));
        }

        const nextPredicates = [...others, ...mergedRange];
        const bundle = refreshBundleMetadata({
            ...ctx.bundle,
            predicates: nextPredicates,
        });

        return {
            bundle,
            changed: true,
            contradiction: false,
            coveredAtoms: [],
            skippedAtoms: [],
            warnings: [],
        };
    },
};
