import type { PredicateAtom } from "../ir/predicate-atom";
import { compareScalarValues, isComparableScalar } from "../../utils/compare-values";

export type RangeLower = { kind: "gt" | "gte"; value: unknown };
export type RangeUpper = { kind: "lt" | "lte"; value: unknown };

export function isRangeAtom(atom: PredicateAtom): atom is Extract<PredicateAtom, { kind: "gt" | "gte" | "lt" | "lte" }> {
    return atom.kind === "gt" || atom.kind === "gte" || atom.kind === "lt" || atom.kind === "lte";
}

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

export type MergedRangeFromAtoms = {
    lower: RangeLower | null;
    upper: RangeUpper | null;
    rangeAtomCount: number;
    skippedNonComparableRange: boolean;
};

/**
 * Merges gt/gte/lt/lte atoms (same field) into one lower and one upper bound.
 */
export function mergeRangeBoundsFromRangeAtoms(rangeAtoms: PredicateAtom[]): MergedRangeFromAtoms {
    let lower: RangeLower | null = null;
    let upper: RangeUpper | null = null;
    let rangeAtomCount = 0;
    let skippedNonComparableRange = false;

    for (const p of rangeAtoms) {
        if (!isRangeAtom(p)) {
            continue;
        }
        rangeAtomCount += 1;
        const asLower = toRangeLower(p);
        if (asLower) {
            if (!isComparableScalar(asLower.value)) {
                skippedNonComparableRange = true;
                continue;
            }
            lower = chooseStrongerLowerBound(lower, asLower);
            continue;
        }
        const asUpper = toRangeUpper(p);
        if (asUpper) {
            if (!isComparableScalar(asUpper.value)) {
                skippedNonComparableRange = true;
                continue;
            }
            upper = chooseStrongerUpperBound(upper, asUpper);
        }
    }

    return { lower, upper, rangeAtomCount, skippedNonComparableRange };
}

export function mergedBoundsContradict(lower: RangeLower | null, upper: RangeUpper | null): boolean {
    if (!lower || !upper) {
        return false;
    }
    const cmp = compareScalarValues(lower.value, upper.value);
    if (cmp === 1) {
        return true;
    }
    if (cmp === 0 && (lower.kind === "gt" || upper.kind === "lt")) {
        return true;
    }
    return false;
}

export function valueSatisfiesLowerBound(v: unknown, lower: RangeLower | null): boolean {
    if (!lower) {
        return true;
    }
    if (!isComparableScalar(v)) {
        return false;
    }
    const cmp = compareScalarValues(v, lower.value);
    if (cmp === null) {
        return false;
    }
    if (lower.kind === "gt") {
        return cmp > 0;
    }
    return cmp >= 0;
}

export function valueSatisfiesUpperBound(v: unknown, upper: RangeUpper | null): boolean {
    if (!upper) {
        return true;
    }
    if (!isComparableScalar(v)) {
        return false;
    }
    const cmp = compareScalarValues(v, upper.value);
    if (cmp === null) {
        return false;
    }
    if (upper.kind === "lt") {
        return cmp < 0;
    }
    return cmp <= 0;
}

export function valueSatisfiesMergedRange(v: unknown, lower: RangeLower | null, upper: RangeUpper | null): boolean {
    return valueSatisfiesLowerBound(v, lower) && valueSatisfiesUpperBound(v, upper);
}
