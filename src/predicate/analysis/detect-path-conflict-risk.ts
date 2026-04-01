import type { FieldPredicateBundle } from "../ir/field-predicate-bundle";

const DOT_SEGMENT_NUMERIC = /\.(\d+)(\.|$)/;

export function detectDottedPathConflictRisk(bundle: FieldPredicateBundle): boolean {
    if (bundle.fieldPath.includes(".")) {
        return true;
    }
    if (DOT_SEGMENT_NUMERIC.test(bundle.fieldPath)) {
        return true;
    }
    return false;
}
