import type { FieldNode } from "../../ast/types";
import { buildFieldPredicateBundleFromFieldNode, refreshBundleMetadata } from "../../predicate/ir/build-field-bundle";
import type { FieldPredicateBundle } from "../../predicate/ir/field-predicate-bundle";
import type { ConstraintSet } from "../context/constraint-set";

export function createBranchLocalBundle(fieldNode: FieldNode, inherited: ConstraintSet): FieldPredicateBundle {
    const local = buildFieldPredicateBundleFromFieldNode(fieldNode);
    const inheritedAtoms = inherited.byField.get(fieldNode.field) ?? [];
    const mergedPredicates = [...inheritedAtoms, ...local.predicates];
    const bundle: FieldPredicateBundle = {
        ...local,
        predicates: mergedPredicates,
        metadata: local.metadata,
    };
    return refreshBundleMetadata(bundle);
}
