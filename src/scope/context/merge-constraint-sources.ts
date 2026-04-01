import type { ConstraintSet } from "./constraint-set";
import { cloneConstraintSet, emptyConstraintSet } from "./constraint-set";

export function mergeConstraintSources(a: ConstraintSet, b: ConstraintSet): ConstraintSet {
    const out = cloneConstraintSet(a);
    out.metadata.hasUnsupportedSemantics =
        out.metadata.hasUnsupportedSemantics || b.metadata.hasUnsupportedSemantics;
    out.metadata.extractionRejections.push(...b.metadata.extractionRejections);

    for (const [field, atoms] of b.byField) {
        const cur = out.byField.get(field) ?? [];
        out.byField.set(field, [...cur, ...atoms]);
    }
    out.opaqueConstraints.push(...b.opaqueConstraints);
    return out;
}

export function mergeManyConstraintSources(sets: ConstraintSet[]): ConstraintSet {
    if (sets.length === 0) {
        return emptyConstraintSet();
    }
    let acc = cloneConstraintSet(sets[0]);
    for (let i = 1; i < sets.length; i += 1) {
        acc = mergeConstraintSources(acc, sets[i]);
    }
    return acc;
}
