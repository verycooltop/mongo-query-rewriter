import type { Selector } from "../types";
import type { FieldCondition, LogicalOperator, SelectorAST } from "../ast/types";
import { ASTNodeBuilder } from "../ast/builders";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEjsonObjectId(value: unknown): value is { $oid: string } {
    if (!isPlainObject(value)) {
        return false;
    }
    return Object.keys(value).length === 1 && typeof (value as Record<string, unknown>)["$oid"] === "string";
}

function isLogicalOperator(key: string): key is LogicalOperator {
    return key === "$and" || key === "$or" || key === "$nor";
}

/**
 * Mongo Query Object → Selector AST。
 *
 * 规则（摘自设计稿）：
 * - `{ a: 5 }` 统一为 FieldNode：`{ field: 'a', conditions: [{ op: '$eq', value: 5 }] }`
 * - 顶层多个字段等价于隐式 `$and`
 *
 * @param selector - MongoDB 选择器对象
 * @returns AST
 */
export function parseSelector(selector: Selector): SelectorAST {
    if (selector == null || typeof selector !== "object" || Array.isArray(selector)) {
        return ASTNodeBuilder.trueNode();
    }
    const children: SelectorAST[] = [];

    // logical clauses
    for (const key of Object.keys(selector)) {
        if (!isLogicalOperator(key)) {
            continue;
        }
        const value = (selector as Record<string, unknown>)[key];
        if (Array.isArray(value)) {
            children.push({
                type: "logical",
                op: key,
                children: value.map((x) => parseSelector(x as Selector)),
            });
        }
    }

    // field clauses (implicit AND)
    for (const [key, value] of Object.entries(selector)) {
        // todo 需要给这些安排明白，后续要分析这些操作符
        if (key.startsWith("$")) {
            continue;
        }
        children.push({
            type: "field",
            field: key,
            conditions: toFieldConditions(value),
        });
    }

    if (children.length === 0) {
        return ASTNodeBuilder.trueNode();
    }
    if (children.length === 1) {
        return children[0];
    }
    return { type: "logical", op: "$and", children };
}

/**
 * 将某字段的条件值（字面量或 { $eq, $in, $gt, ... }）转为统一的 FieldCondition[]（toFieldConditions）。
 *
 * @param fieldValue - 字段对应的值或操作符对象
 */
export function toFieldConditions(fieldValue: unknown): FieldCondition[] {
    // Extended JSON 标量（如 { $oid: "..." }）是“值”，不是查询操作符对象
    if (isEjsonObjectId(fieldValue)) {
        return [{ op: "$eq", value: fieldValue }];
    }
    if (!isPlainObject(fieldValue) || Object.keys(fieldValue).every((k) => !k.startsWith("$"))) {
        return [{ op: "$eq", value: fieldValue }];
    }

    const conditions: FieldCondition[] = [];
    for (const [op, raw] of Object.entries(fieldValue)) {
        if (!op.startsWith("$")) {
            continue;
        }

        switch (op) {
            case "$eq":
                conditions.push({ op: "$eq", value: raw });
                break;
            case "$ne":
                conditions.push({ op: "$ne", value: raw });
                break;
            case "$gt":
            case "$gte":
            case "$lt":
            case "$lte":
                conditions.push({ op, value: raw as number | Date });
                break;
            case "$all":
                conditions.push({ op: "$all", value: Array.isArray(raw) ? (raw as unknown[]) : [raw] });
                break;
            case "$size": {
                const n = typeof raw === "number" ? raw : Number(raw);
                if (!Number.isFinite(n)) {
                    conditions.push({ op: "$eq", value: { [op]: raw } });
                    break;
                }
                conditions.push({ op: "$size", value: n });
                break;
            }
            case "$in":
            case "$nin":
                conditions.push({ op, value: Array.isArray(raw) ? (raw as unknown[]) : [raw] });
                break;
            case "$exists":
                conditions.push({ op: "$exists", value: Boolean(raw) });
                break;
            case "$regex":
                conditions.push({ op: "$regex", value: raw as RegExp | string });
                break;
            default:
                // 未显式建模的操作符先按 $eq 退化为字面量比较，避免丢信息
                conditions.push({ op: "$eq", value: { [op]: raw } });
                break;
        }
    }

    return conditions.length > 0 ? conditions : [{ op: "$eq", value: fieldValue }];
}
