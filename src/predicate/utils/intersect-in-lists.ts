import type { PredicateAtom } from "../ir/predicate-atom";
import { valuesEqual } from "./value-equality";

export function intersectInAtomValues(ins: Extract<PredicateAtom, { kind: "in" }>[]): unknown[] {
    if (ins.length === 0) {
        return [];
    }
    let acc = [...ins[0].values];
    for (let i = 1; i < ins.length; i++) {
        acc = acc.filter((x) => ins[i].values.some((y) => valuesEqual(x, y)));
    }
    return acc;
}
