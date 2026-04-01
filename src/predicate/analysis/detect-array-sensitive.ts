import type { FieldPredicateBundle } from "../ir/field-predicate-bundle";
import type { PredicateAtom } from "../ir/predicate-atom";

function valueLooksArraySensitive(value: unknown): boolean {
    if (value === null || value === undefined) {
        return false;
    }
    if (Array.isArray(value)) {
        return true;
    }
    if (typeof value === "object") {
        return true;
    }
    return false;
}

function atomIsArraySensitive(atom: PredicateAtom): boolean {
    if (atom.kind === "nin") {
        return true;
    }
    if (atom.kind === "in") {
        return atom.values.some(valueLooksArraySensitive);
    }
    return false;
}

export function detectArraySensitiveSemantics(bundle: FieldPredicateBundle): boolean {
    for (const atom of bundle.predicates) {
        if (atomIsArraySensitive(atom)) {
            return true;
        }
    }
    return false;
}
