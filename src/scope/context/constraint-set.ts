import type { QueryNode } from "../../ast/types";
import type { PredicateAtom } from "../../predicate/ir/predicate-atom";

/** Record when an atom or field is not promoted into inherited constraints (phase-1 allowlist). */
export type ConstraintExtractionRejection = {
    fieldPath: string;
    atomKind: string;
    reason: string;
};

export type ConstraintSet = {
    byField: Map<string, PredicateAtom[]>;
    opaqueConstraints: QueryNode[];
    metadata: {
        hasUnsupportedSemantics: boolean;
        extractionRejections: ConstraintExtractionRejection[];
    };
};

export function emptyConstraintSet(): ConstraintSet {
    return {
        byField: new Map(),
        opaqueConstraints: [],
        metadata: { hasUnsupportedSemantics: false, extractionRejections: [] },
    };
}

export function cloneConstraintSet(set: ConstraintSet): ConstraintSet {
    const byField = new Map<string, PredicateAtom[]>();
    for (const [k, v] of set.byField) {
        byField.set(k, [...v]);
    }
    return {
        byField,
        opaqueConstraints: [...set.opaqueConstraints],
        metadata: {
            hasUnsupportedSemantics: set.metadata.hasUnsupportedSemantics,
            extractionRejections: [...set.metadata.extractionRejections],
        },
    };
}
