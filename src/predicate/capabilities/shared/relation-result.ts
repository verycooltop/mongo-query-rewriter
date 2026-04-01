import type { FieldPredicateBundle } from "../../ir/field-predicate-bundle";
import type { PredicateAtom } from "../../ir/predicate-atom";

export type RelationResult = {
    bundle: FieldPredicateBundle;
    changed: boolean;
    contradiction: boolean;
    coveredAtoms: PredicateAtom[];
    skippedAtoms: PredicateAtom[];
    warnings: string[];
};

export function emptyRelationResult(bundle: FieldPredicateBundle): RelationResult {
    return {
        bundle,
        changed: false,
        contradiction: false,
        coveredAtoms: [],
        skippedAtoms: [],
        warnings: [],
    };
}
