import type { FieldCondition, FieldNode, LogicalNode, SelectorAST } from "../ast/types";
import { isModeledFieldOperator } from "./operators";
import { areValuesEqual } from "./utils";

/**
 * 合并后的 conditions 是否允许进入同一 FieldNode。
 * 对 **modeled** 操作符，允许多个同 op 异值（如两个 $eq）交给 fieldConditionNormalize；
 * 对 **非 modeled** 同 op 异值则不能合并，否则 compile 无法表示为单个 BSON 对象。
 */
function fieldConditionsMergeable(a: FieldCondition[], b: FieldCondition[]): boolean {
    const combined = [...a, ...b];
    const byOp = new Map<string, unknown>();
    for (const c of combined) {
        const prev = byOp.get(c.op);
        if (prev === undefined) {
            byOp.set(c.op, c.value);
            continue;
        }
        if (areValuesEqual(prev, c.value)) {
            continue;
        }
        if (isModeledFieldOperator(c.op)) {
            continue;
        }
        return false;
    }
    return true;
}

/**
 * 将同一字段上按出现顺序收集的 FieldNode 折叠为若干段，每段内可安全拼接 conditions。
 */
function foldFieldNodes(nodes: FieldNode[]): FieldNode[] {
    if (nodes.length === 0) {
        return [];
    }
    const chunks: FieldNode[] = [];
    let acc = nodes[0];
    for (let k = 1; k < nodes.length; k++) {
        const next = nodes[k];
        if (fieldConditionsMergeable(acc.conditions, next.conditions)) {
            acc = {
                type: "field",
                field: acc.field,
                conditions: [...acc.conditions, ...next.conditions],
            };
        } else {
            chunks.push(acc);
            acc = next;
        }
    }
    chunks.push(acc);
    return chunks;
}

/**
 * 在 `$and` 子节点列表上按字段分组、折叠后再按「首次出现字段」顺序展开（中间 logical 等保留原位）。
 */
function mergeAndChildren(children: SelectorAST[]): SelectorAST[] {
    const perField = new Map<string, FieldNode[]>();
    for (const ch of children) {
        if (ch.type === "field") {
            const arr = perField.get(ch.field) ?? [];
            arr.push(ch);
            perField.set(ch.field, arr);
        }
    }

    const foldedByField = new Map<string, FieldNode[]>();
    for (const [f, nodes] of perField) {
        foldedByField.set(f, foldFieldNodes(nodes));
    }

    const seen = new Set<string>();
    const out: SelectorAST[] = [];
    for (const ch of children) {
        if (ch.type !== "field") {
            out.push(ch);
            continue;
        }
        if (seen.has(ch.field)) {
            continue;
        }
        seen.add(ch.field);
        const folded = foldedByField.get(ch.field) ?? [];
        out.push(...folded);
    }
    return out;
}

/**
 * predicateMerge（AST → AST）：
 * - 只在 `$and` 内合并同字段 FieldNode（conditions 拼接后由 fieldConditionNormalize 处理）
 * - 非 modeled 同 op 异值拆成多个 FieldNode，避免 compile 重复键
 * - 不做逻辑推理/冲突检测（交给 simplify）
 */
export function predicateMerge(ast: SelectorAST): SelectorAST {
    if (ast.type !== "logical") {
        return ast;
    }

    const children = ast.children.map(predicateMerge);
    const node: LogicalNode = { ...ast, children };

    if (node.op !== "$and") {
        return node;
    }

    return { ...node, children: mergeAndChildren(children) };
}
