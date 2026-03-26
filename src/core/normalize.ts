import type { LogicalNode, SelectorAST } from "../ast/types";
import { ASTNodeBuilder } from "../ast/builders";

/**
 * normalize（AST → AST）：
 * - 只做结构等价变换：打平同 op、移除空逻辑、移除单子节点逻辑
 * - 不做 predicate 合并/排序（交给 predicateMerge/canonicalize 阶段）
 */
export function normalize(ast: SelectorAST): SelectorAST {
    if (ast.type !== "logical") {
        return ast;
    }

    const normalizedChildren = ast.children.map((c) => normalize(c));

    // 先同 op 打平
    let flattened: SelectorAST[] =
        ast.op === "$and" || ast.op === "$or"
            ? normalizedChildren.flatMap((c) =>
                  c.type === "logical" && c.op === ast.op ? c.children : [c]
              )
            : normalizedChildren;

    // $nor: 单子项为 $or 时与 Mongo 扁平 $nor:[...] 语义等价；收拢避免 $nor→$or 包装形与扁平形双轨
    if (ast.op === "$nor" && flattened.length === 1) {
        const only = flattened[0];
        if (only.type === "logical" && only.op === "$or") {
            flattened = only.children;
        }
    }

    // 移除 empty logical
    if (flattened.length === 0) {
        switch (ast.op) {
            case "$and":
                return ASTNodeBuilder.trueNode();
            case "$or":
                return ASTNodeBuilder.falseNode();
            case "$nor":
                return ASTNodeBuilder.trueNode();
        }
    }

    // 移除 single logical（仅对 $and/$or；$nor 不能折叠，否则语义改变）
    if (flattened.length === 1 && (ast.op === "$and" || ast.op === "$or")) {
        return flattened[0];
    }

    const node: LogicalNode = { ...ast, children: flattened };
    return node;
}
