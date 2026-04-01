import { deepEqual } from "../../utils/deep-equal";

export function valuesEqual(a: unknown, b: unknown): boolean {
    return deepEqual(a, b);
}
