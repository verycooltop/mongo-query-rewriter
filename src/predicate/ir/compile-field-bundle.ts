import { falseNode, fieldNode } from "../../ast/builders";
import type { FieldPredicate, QueryNode } from "../../ast/types";
import type { FieldPredicateBundle } from "./field-predicate-bundle";
import type { PredicateAtom } from "./predicate-atom";

function atomToFieldPredicate(atom: PredicateAtom): FieldPredicate {
    switch (atom.kind) {
        case "eq":
            return { op: "$eq", value: atom.value };
        case "ne":
            return { op: "$ne", value: atom.value };
        case "in":
            return { op: "$in", value: atom.values };
        case "nin":
            return { op: "$nin", value: atom.values };
        case "gt":
            return { op: "$gt", value: atom.value };
        case "gte":
            return { op: "$gte", value: atom.value };
        case "lt":
            return { op: "$lt", value: atom.value };
        case "lte":
            return { op: "$lte", value: atom.value };
        case "exists":
            return { op: "$exists", value: atom.value };
        case "opaque":
            return { op: atom.operator === "raw" ? "raw" : atom.operator, value: atom.raw, opaque: true };
    }
}

const KIND_ORDER: Record<PredicateAtom["kind"], number> = {
    eq: 0,
    ne: 1,
    in: 2,
    nin: 3,
    gt: 4,
    gte: 5,
    lt: 6,
    lte: 7,
    exists: 8,
    opaque: 9,
};

function compareAtomsForStableOrder(a: PredicateAtom, b: PredicateAtom): number {
    const ka = KIND_ORDER[a.kind];
    const kb = KIND_ORDER[b.kind];
    if (ka !== kb) {
        return ka - kb;
    }
    return 0;
}

export function compileFieldPredicateBundleToAst(bundle: FieldPredicateBundle, contradiction: boolean): QueryNode {
    if (contradiction) {
        return falseNode();
    }

    const sorted = [...bundle.predicates].sort(compareAtomsForStableOrder);
    const predicates: FieldPredicate[] = sorted.map(atomToFieldPredicate);
    return fieldNode(bundle.fieldPath, predicates);
}
