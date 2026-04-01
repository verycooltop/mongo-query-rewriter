import type { PredicateAtom } from "./predicate-atom";
import { valuesEqual } from "../utils/value-equality";

function atomsStructurallyEqual(a: PredicateAtom, b: PredicateAtom): boolean {
    if (a.kind !== b.kind) {
        return false;
    }
    switch (a.kind) {
        case "eq":
        case "ne":
        case "gt":
        case "gte":
        case "lt":
        case "lte":
        case "exists":
            return valuesEqual(a.value, (b as typeof a).value);
        case "in":
        case "nin":
            return valuesEqual(a.values, (b as typeof a).values);
        case "opaque":
            return a.operator === (b as typeof a).operator && valuesEqual(a.raw, (b as typeof a).raw);
        default: {
            return false;
        }
    }
}

export function dedupePredicateAtoms(predicates: PredicateAtom[]): { next: PredicateAtom[]; changed: boolean } {
    const next: PredicateAtom[] = [];
    let changed = false;
    outer: for (const p of predicates) {
        for (const q of next) {
            if (atomsStructurallyEqual(p, q)) {
                changed = true;
                continue outer;
            }
        }
        next.push(p);
    }
    return { next, changed };
}
