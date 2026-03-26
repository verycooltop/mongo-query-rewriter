import type { FieldCondition, FieldNode, LogicalNode, SelectorAST } from "../ast/types";
import { ASTNodeBuilder } from "../ast/builders";
import { areValuesEqual } from "./utils";

type NormalizeResult =
    | { conditions: FieldCondition[] }
    | { impossible: true };

function toNum(v: unknown): number | undefined {
    if (v instanceof Date) {
        return v.getTime();
    }
    if (typeof v === "number") {
        return v;
    }
    return undefined;
}

function intersectByValue(left: unknown[], right: unknown[]): unknown[] {
    return left.filter((item) => right.some((r) => areValuesEqual(item, r)));
}

function unionByValue(arrays: unknown[][]): unknown[] {
    const result: unknown[] = [];
    for (const arr of arrays) {
        for (const v of arr) {
            if (!result.some((r) => areValuesEqual(r, v))) {
                result.push(v);
            }
        }
    }
    return result;
}

/**
 * 单字段条件语义合并：仅 **modeled** 操作符（见 `operators.isModeledFieldOperator`）参与区间与 $in 合并；
 * `$ne`、`$regex`、`$size` 及其他 op 进入 `others` 透传，不与此处推理交互。
 */
export function normalizeFieldConditions(conditions: FieldCondition[]): NormalizeResult {
    if (conditions.length === 0) {
        return { conditions: [] };
    }

    const others: FieldCondition[] = [];
    let eq: unknown | undefined;
    let hasEqConflict = false;
    let min: number | undefined;
    let minVal: number | Date | undefined;
    let minInclusive = false;
    let max: number | undefined;
    let maxVal: number | Date | undefined;
    let maxInclusive = false;
    let inSet: unknown[] | undefined;
    let ninSet: unknown[] = [];
    let exists: boolean | undefined;

    for (const cond of conditions) {
        const op = cond.op;
        const value = cond.value;

        switch (op) {
            case "$eq": {
                if (eq === undefined) {
                    eq = value;
                } else if (!areValuesEqual(eq, value)) {
                    hasEqConflict = true;
                }
                break;
            }
            case "$gt":
            case "$gte": {
                const n = toNum(value);
                if (n === undefined) {
                    others.push(cond);
                    break;
                }
                const rawMin = value as number | Date;
                if (min === undefined || n > min || (n === min && op === "$gt" && minInclusive)) {
                    min = n;
                    minVal = rawMin;
                    minInclusive = op === "$gte";
                } else if (n === min && op === "$gte") {
                    minInclusive = true;
                }
                break;
            }
            case "$lt":
            case "$lte": {
                const n = toNum(value);
                if (n === undefined) {
                    others.push(cond);
                    break;
                }
                const rawMax = value as number | Date;
                if (max === undefined || n < max || (n === max && op === "$lt" && maxInclusive)) {
                    max = n;
                    maxVal = rawMax;
                    maxInclusive = op === "$lte";
                } else if (n === max && op === "$lte") {
                    maxInclusive = true;
                }
                break;
            }
            case "$in": {
                const arr = Array.isArray(value) ? value : [value];
                inSet = inSet === undefined ? [...arr] : intersectByValue(inSet, arr);
                break;
            }
            case "$nin": {
                const arr = Array.isArray(value) ? value : [value];
                ninSet = unionByValue([ninSet, arr]);
                break;
            }
            case "$exists": {
                const b = Boolean(value);
                if (exists === undefined) {
                    exists = b;
                } else if (exists !== b) {
                    return { impossible: true };
                }
                break;
            }
            default:
                others.push(cond);
        }
    }

    if (eq !== undefined) {
        const num = toNum(eq);
        if (num !== undefined) {
            if (min !== undefined && (num < min || (num === min && !minInclusive))) {
                hasEqConflict = true;
            }
            if (max !== undefined && (num > max || (num === max && !maxInclusive))) {
                hasEqConflict = true;
            }
        }
        if (inSet !== undefined && !inSet.some((v) => areValuesEqual(v, eq))) {
            hasEqConflict = true;
        }
        if (ninSet.some((v) => areValuesEqual(v, eq))) {
            hasEqConflict = true;
        }
    }

    if (min !== undefined && max !== undefined) {
        if (min > max || (min === max && (!minInclusive || !maxInclusive))) {
            return { impossible: true };
        }
    }

    if (inSet !== undefined && inSet.length === 0) {
        return { impossible: true };
    }

    if (hasEqConflict) {
        return { impossible: true };
    }

    const result: FieldCondition[] = [];

    if (eq !== undefined) {
        result.push({ op: "$eq", value: eq });
    } else {
        if (inSet !== undefined && inSet.length > 0) {
            const filtered =
                ninSet.length > 0
                    ? inSet.filter((v) => !ninSet.some((n) => areValuesEqual(n, v)))
                    : inSet;
            if (filtered.length === 0) {
                return { impossible: true };
            }
            result.push({ op: "$in", value: filtered });
        } else {
            if (min !== undefined && minVal !== undefined) {
                result.push({
                    op: minInclusive ? "$gte" : "$gt",
                    value: minVal,
                });
            }
            if (max !== undefined && maxVal !== undefined) {
                result.push({
                    op: maxInclusive ? "$lte" : "$lt",
                    value: maxVal,
                });
            }
        }
    }

    if (exists !== undefined) {
        result.push({ op: "$exists", value: exists });
    }

    if (ninSet.length > 0) {
        result.push({ op: "$nin", value: ninSet });
    }

    // 已写入 result 的 op（如数值化后的 $lte）不再从 others 重复追加，避免 compile 重复键
    const seenOps = new Set(result.map((c) => c.op));
    for (const c of others) {
        if (!seenOps.has(c.op)) {
            result.push(c);
            seenOps.add(c.op);
        }
    }
    return { conditions: result };
}

/**
 * 对单个 FieldNode 做条件规范化，冲突或空条件时返回 FalseNode/TrueNode。
 */
export function normalizeFieldNode(node: FieldNode): SelectorAST {
    const result = normalizeFieldConditions(node.conditions);
    if ("impossible" in result) {
        return ASTNodeBuilder.falseNode();
    }
    if (result.conditions.length === 0) {
        return ASTNodeBuilder.trueNode();
    }
    return { ...node, conditions: result.conditions };
}

/**
 * AST 层同字段条件语义合并：递归处理所有 FieldNode，冲突替换为 FalseNode。
 * 管线中放在 predicateMerge 之后、simplify 之前。
 */
export function fieldConditionNormalize(ast: SelectorAST): SelectorAST {
    if (ast.type === "true" || ast.type === "false") {
        return ast;
    }

    if (ast.type === "field") {
        return normalizeFieldNode(ast);
    }

    const node = ast as LogicalNode;
    const children = node.children.map(fieldConditionNormalize);
    return { ...node, children };
}
