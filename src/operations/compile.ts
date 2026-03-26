import type { Selector } from "../types";
import { IMPOSSIBLE_SELECTOR } from "../types";
import type { FieldCondition, SelectorAST } from "../ast/types";

function isEmptyObject(value: unknown): boolean {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value as object).length === 0
    );
}

/**
 * AST → Mongo Selector 纯直译，不修改结构（结构由 canonicalize 保证）。
 */
export function compileSelector(ast: SelectorAST): Selector {
    switch (ast.type) {
        case "true":
            return {};
        case "false":
            return IMPOSSIBLE_SELECTOR;
        case "field":
            return { [ast.field]: compileFieldConditions(ast.conditions) } as Selector;
        case "logical": {
            if (ast.op === "$and") {
                const compiled: Selector[] = [];
                for (const child of ast.children) {
                    const c = compileSelector(child);
                    if (!isEmptyObject(c)) {
                        compiled.push(c);
                    }
                }
                if (compiled.length === 0) {
                    return {};
                }
                if (compiled.length === 1) {
                    return compiled[0];
                }
                return { $and: compiled } as Selector;
            }
            return {
                [ast.op]: ast.children.map((c) => compileSelector(c)),
            } as Selector;
        }
        default:
            throw new Error(
                "Unknown AST node type: " + (ast && typeof ast === "object" && "type" in ast ? (ast as { type: unknown }).type : String(ast))
            );
    }
}

/**
 * 将已规范化的 FieldCondition[] 编译为 Mongo 字段值（字面量或 { $op: value }）。
 * 条件合并与 $eq/$in 规范化由 fieldConditionNormalize 在 AST 层完成，此处仅做直译。
 *
 * **不变量（前置条件）**：同一 `op` 在 `conditions` 中至多出现一次。
 * 若违反，对象字面量赋值会静默覆盖；开发环境下会抛出以便尽早发现上游回归。
 */
function compileFieldConditions(conditions: FieldCondition[]): unknown {
    if (conditions.length === 0) {
        return undefined;
    }
    if (conditions.length === 1 && conditions[0].op === "$eq") {
        return conditions[0].value;
    }

    const out: Record<string, unknown> = {};
    for (const c of conditions) {
        if (Object.prototype.hasOwnProperty.call(out, c.op)) {
            throw new Error(
                `compileFieldConditions: duplicate operator "${c.op}" — upstream must merge or order uniquely`
            );
        }
        out[c.op] = c.value;
    }
    return out;
}
