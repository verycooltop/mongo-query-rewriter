import type { FieldCondition } from "../ast/types";
import { areValuesEqual } from "./utils";

type Bound = { value: number | Date; inclusive: boolean };

/** 与 `operators.ts` 分层一致：仅这些 op 参与父子 tighten；其余保留在子条件中。 */
const SUPPORTED_TIGHTEN_OPS = new Set([
    "$eq",
    "$ne",
    "$gt",
    "$gte",
    "$lt",
    "$lte",
    "$nin",
    "$exists",
] as const);

function toNum(value: number | Date): number {
    return value instanceof Date ? value.getTime() : value;
}

function maxLowerBound(current: Bound | undefined, next: Bound): Bound {
    if (!current) {
        return next;
    }
    const currentNum = toNum(current.value);
    const nextNum = toNum(next.value);
    if (nextNum > currentNum) {
        return next;
    }
    if (nextNum < currentNum) {
        return current;
    }
    return current.inclusive && !next.inclusive ? next : current;
}

function minUpperBound(current: Bound | undefined, next: Bound): Bound {
    if (!current) {
        return next;
    }
    const currentNum = toNum(current.value);
    const nextNum = toNum(next.value);
    if (nextNum < currentNum) {
        return next;
    }
    if (nextNum > currentNum) {
        return current;
    }
    return current.inclusive && !next.inclusive ? next : current;
}

function boundsImpossible(lower: Bound | undefined, upper: Bound | undefined): boolean {
    if (!lower || !upper) {
        return false;
    }
    const lowerNum = toNum(lower.value);
    const upperNum = toNum(upper.value);
    if (lowerNum > upperNum) {
        return true;
    }
    if (lowerNum < upperNum) {
        return false;
    }
    return !(lower.inclusive && upper.inclusive);
}

function uniqueByValue(items: unknown[]): unknown[] {
    const result: unknown[] = [];
    for (const item of items) {
        if (!result.some((existing) => areValuesEqual(existing, item))) {
            result.push(item);
        }
    }
    return result;
}

function intersectByValue(left: unknown[], right: unknown[]): unknown[] {
    return left.filter((item) => right.some((candidate) => areValuesEqual(item, candidate)));
}

function inSetFromConditions(conditions: FieldCondition[]): unknown[] | undefined {
    let set: unknown[] | undefined;
    for (const condition of conditions) {
        if (condition.op !== "$in") {
            continue;
        }
        const array = Array.isArray(condition.value) ? (condition.value as unknown[]) : [condition.value];
        set = set ? intersectByValue(set, array) : uniqueByValue(array);
    }
    return set;
}

function valueSetEqual(left: unknown[], right: unknown[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((value) => right.some((candidate) => areValuesEqual(value, candidate)));
}

export type TightenResult = {
    conditions: FieldCondition[];
    impossible: boolean;
    changed: boolean;
};

export function tightenChildConditionsByParent(
    parent: FieldCondition[],
    child: FieldCondition[]
): TightenResult {
    const parentSupported = parent.filter((condition) =>
        SUPPORTED_TIGHTEN_OPS.has(
            condition.op as (typeof SUPPORTED_TIGHTEN_OPS extends Set<infer U> ? U : never)
        )
    );
    const childSupported = child.filter((condition) =>
        SUPPORTED_TIGHTEN_OPS.has(
            condition.op as (typeof SUPPORTED_TIGHTEN_OPS extends Set<infer U> ? U : never)
        )
    );
    const childUnsupported = child.filter(
        (condition) =>
            !SUPPORTED_TIGHTEN_OPS.has(
                condition.op as (typeof SUPPORTED_TIGHTEN_OPS extends Set<infer U> ? U : never)
            )
    );

    const parentInSet = inSetFromConditions(parentSupported);

    const effective = [...parentSupported, ...childSupported];

    let eq: unknown | undefined;
    const neList: unknown[] = [];
    let inSet: unknown[] | undefined;
    const ninSet: unknown[] = [];
    let exists: boolean | undefined;
    let lower: Bound | undefined;
    let upper: Bound | undefined;

    for (const condition of effective) {
        switch (condition.op) {
            case "$eq":
                eq = condition.value;
                break;
            case "$ne":
                neList.push(condition.value);
                break;
            case "$in": {
                const array = Array.isArray(condition.value)
                    ? (condition.value as unknown[])
                    : [condition.value];
                inSet = inSet ? intersectByValue(inSet, array) : uniqueByValue(array);
                break;
            }
            case "$nin": {
                const array = Array.isArray(condition.value)
                    ? (condition.value as unknown[])
                    : [condition.value];
                for (const value of array) {
                    ninSet.push(value);
                }
                break;
            }
            case "$exists":
                exists = Boolean(condition.value);
                break;
            case "$gt":
                if (typeof condition.value === "number" || condition.value instanceof Date) {
                    lower = maxLowerBound(lower, {
                        value: condition.value as number | Date,
                        inclusive: false,
                    });
                }
                break;
            case "$gte":
                if (typeof condition.value === "number" || condition.value instanceof Date) {
                    lower = maxLowerBound(lower, {
                        value: condition.value as number | Date,
                        inclusive: true,
                    });
                }
                break;
            case "$lt":
                if (typeof condition.value === "number" || condition.value instanceof Date) {
                    upper = minUpperBound(upper, {
                        value: condition.value as number | Date,
                        inclusive: false,
                    });
                }
                break;
            case "$lte":
                if (typeof condition.value === "number" || condition.value instanceof Date) {
                    upper = minUpperBound(upper, {
                        value: condition.value as number | Date,
                        inclusive: true,
                    });
                }
                break;
        }
    }

    const uniqNin = uniqueByValue(ninSet);
    const uniqNe = uniqueByValue(neList);

    if (exists === false) {
        if (eq !== undefined) {
            return { conditions: child, impossible: true, changed: false };
        }
        if (inSet && inSet.length > 0) {
            return { conditions: child, impossible: true, changed: false };
        }
        if (lower || upper) {
            return { conditions: child, impossible: true, changed: false };
        }
    }

    if (boundsImpossible(lower, upper)) {
        return { conditions: child, impossible: true, changed: false };
    }

    if (eq !== undefined) {
        if (exists === true && eq === null) {
            return { conditions: child, impossible: true, changed: false };
        }
        if (inSet && !inSet.some((value) => areValuesEqual(value, eq))) {
            return { conditions: child, impossible: true, changed: false };
        }
        if (uniqNin.some((value) => areValuesEqual(value, eq))) {
            return { conditions: child, impossible: true, changed: false };
        }
        if (uniqNe.some((value) => areValuesEqual(value, eq))) {
            return { conditions: child, impossible: true, changed: false };
        }
        if (lower) {
            const eqNum =
                typeof eq === "number" || eq instanceof Date
                    ? toNum(eq as number | Date)
                    : undefined;
            if (eqNum !== undefined) {
                const lowerNum = toNum(lower.value);
                if (lower.inclusive ? eqNum < lowerNum : eqNum <= lowerNum) {
                    return { conditions: child, impossible: true, changed: false };
                }
            }
        }
        if (upper) {
            const eqNum =
                typeof eq === "number" || eq instanceof Date
                    ? toNum(eq as number | Date)
                    : undefined;
            if (eqNum !== undefined) {
                const upperNum = toNum(upper.value);
                if (upper.inclusive ? eqNum > upperNum : eqNum >= upperNum) {
                    return { conditions: child, impossible: true, changed: false };
                }
            }
        }
    }

    const childHasIn = childSupported.some((condition) => condition.op === "$in");
    const childHasBounds = childSupported.some((condition) =>
        ["$gt", "$gte", "$lt", "$lte"].includes(condition.op)
    );
    const childHasExists = childSupported.some((condition) => condition.op === "$exists");
    const childHasEq = childSupported.some((condition) => condition.op === "$eq");
    const childHasNin = childSupported.some(
        (condition) => condition.op === "$nin" || condition.op === "$ne"
    );

    const outSupported: FieldCondition[] = [];

    const effectiveIsSingleValue =
        eq !== undefined && (!inSet || inSet.some((value) => areValuesEqual(value, eq)));
    const childContributedEq =
        (childHasEq && eq !== undefined) || (childHasIn && effectiveIsSingleValue);
    if (childContributedEq && eq !== undefined) {
        outSupported.push({ op: "$eq", value: eq });
    }

    if (childHasExists && exists !== undefined) {
        outSupported.push({ op: "$exists", value: exists });
    }

    if (childHasIn) {
        const inValue: unknown[] | undefined = eq !== undefined ? [eq] : inSet;
        const redundantWithParent =
            inValue !== undefined &&
            parentInSet !== undefined &&
            valueSetEqual(inValue, parentInSet);
        const redundantWithEq =
            eq !== undefined &&
            inValue !== undefined &&
            inValue.length === 1 &&
            areValuesEqual(inValue[0], eq);
        if (inValue !== undefined && !redundantWithParent && !redundantWithEq) {
            outSupported.push({ op: "$in", value: inValue });
        }
    }

    if (childHasBounds) {
        if (lower) {
            outSupported.push({
                op: lower.inclusive ? "$gte" : "$gt",
                value: lower.value,
            });
        }
        if (upper) {
            outSupported.push({
                op: upper.inclusive ? "$lte" : "$lt",
                value: upper.value,
            });
        }
    }

    if (childHasNin) {
        const mergedNin = uniqueByValue([...uniqNin, ...uniqNe]);
        if (childSupported.some((condition) => condition.op === "$nin") || mergedNin.length > 1) {
            if (mergedNin.length > 0) {
                outSupported.push({ op: "$nin", value: mergedNin });
            }
        } else if (mergedNin.length === 1) {
            outSupported.push({ op: "$ne", value: mergedNin[0] });
        }
    }

    const nextConditions = [...outSupported, ...childUnsupported];

    const changed =
        nextConditions.length !== child.length ||
        nextConditions.some((condition, index) => {
            const original = child[index];
            if (!original) {
                return true;
            }
            if (original.op !== condition.op) {
                return true;
            }
            return !areValuesEqual(original.value, condition.value);
        });

    return { conditions: nextConditions, impossible: false, changed };
}

