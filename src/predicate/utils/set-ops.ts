import { valuesEqual } from "./value-equality";

export function uniqueUnknownArray(values: unknown[]): unknown[] {
    const result: unknown[] = [];
    for (const v of values) {
        if (!result.some((x) => valuesEqual(x, v))) {
            result.push(v);
        }
    }
    return result;
}

export function intersectUnknownArrays(a: unknown[], b: unknown[]): unknown[] {
    return a.filter((x) => b.some((y) => valuesEqual(x, y)));
}
