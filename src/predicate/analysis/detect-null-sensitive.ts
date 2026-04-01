import type { FieldPredicateBundle } from "../ir/field-predicate-bundle";
import type { PredicateAtom } from "../ir/predicate-atom";

function containsNull(value: unknown): boolean {
    return value === null;
}

function atomHasNullSemantics(atom: PredicateAtom): boolean {
    if (atom.kind === "eq" || atom.kind === "ne") {
        return containsNull(atom.value);
    }
    if (atom.kind === "in" || atom.kind === "nin") {
        return atom.values.some(containsNull);
    }
    return false;
}

export function detectNullSensitiveSemantics(bundle: FieldPredicateBundle): boolean {
    for (const atom of bundle.predicates) {
        if (atomHasNullSemantics(atom)) {
            return true;
        }
    }
    return false;
}
