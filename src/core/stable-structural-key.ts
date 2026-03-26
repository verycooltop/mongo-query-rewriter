import type { FieldCondition, SelectorAST } from "../ast/types";

/**
 * 为 canonical form 下的子节点排序生成稳定、无语义含义的字符串键（仅用于 $or / $nor 子句重排）。
 * 不用于语义比较；同一 AST 结构应产生同一键。
 */
export function stableStructuralSortKey(node: SelectorAST): string {
    switch (node.type) {
        case "true":
            return "0:true";
        case "false":
            return "1:false";
        case "field":
            return `2:field:${node.field}:${stableFieldConditionsKey(node.conditions)}`;
        case "logical": {
            const childKeys = node.children.map(stableStructuralSortKey).sort();
            return `3:log:${node.op}(${childKeys.join("\u001f")})`;
        }
        default:
            return "9:unknown";
    }
}

function stableFieldConditionsKey(conditions: FieldCondition[]): string {
    const parts = conditions.map((c) => {
        const v = serializeValueForSort(c.value);
        return `${c.op}\u0000${v}`;
    });
    parts.sort();
    return parts.join("\u001f");
}

function serializeValueForSort(value: unknown): string {
    if (value === undefined) {
        return "u";
    }
    if (value === null) {
        return "n:null";
    }
    if (typeof value === "number") {
        if (Object.is(value, -0)) {
            return "num:-0";
        }
        if (!Number.isFinite(value)) {
            return `num:${String(value)}`;
        }
        return `num:${value}`;
    }
    if (typeof value === "boolean") {
        return `bool:${value}`;
    }
    if (typeof value === "string") {
        return `str:${JSON.stringify(value)}`;
    }
    if (value instanceof Date) {
        return `date:${value.toISOString()}`;
    }
    if (value instanceof RegExp) {
        return `re:${value.source}\u0000${value.flags}`;
    }
    if (Array.isArray(value)) {
        return `arr:[${value.map(serializeValueForSort).join("\u001f")}]`;
    }
    if (typeof value === "object") {
        const o = value as Record<string, unknown>;
        const keys = Object.keys(o).sort();
        const inner = keys.map((k) => `${JSON.stringify(k)}:${serializeValueForSort(o[k])}`).join("\u001f");
        return `obj:{${inner}}`;
    }
    return `x:${String(value)}`;
}
