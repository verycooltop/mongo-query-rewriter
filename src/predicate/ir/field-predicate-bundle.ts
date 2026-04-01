import type { QueryNode } from "../../ast/types";
import type { PredicateAtom } from "./predicate-atom";

export type FieldPredicateBundleMetadata = {
    hasArraySensitiveSemantics: boolean;
    hasNullSemantics: boolean;
    hasUnsupportedOperators: boolean;
    hasDottedPathConflictRisk: boolean;
};

export type FieldPredicateBundle = {
    fieldPath: string;
    sourceNodes: QueryNode[];
    predicates: PredicateAtom[];
    opaqueNodes: QueryNode[];
    metadata: FieldPredicateBundleMetadata;
};
