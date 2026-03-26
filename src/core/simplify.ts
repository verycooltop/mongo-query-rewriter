import { ASTNodeBuilder } from "../ast/builders";
import { isFalseNode, isFieldNode, isLogicalNode, isTrueNode } from "../ast/guards";
import type { FieldCondition, FieldNode, LogicalNode, SelectorAST } from "../ast/types";
import {
    buildLayerContext,
    buildSiblingContext,
    cloneContext,
    collectAndLayerFieldConditions,
    type FieldConditionMap,
    simplifyFieldAgainstContext,
} from "./constraint-propagation";

/**
 * simplify（AST → AST）编排：
 *
 * 1. **约束传播**（`constraint-propagation`）：`$and` 内 sibling context、父级与子级 FieldNode 的
 *    冲突剪枝与 tighten；tighten 仅作用于 `conditions.ts` 中声明的支持操作符，其余条件原样保留，
 *    不改变 Mongo 语义。
 * 2. **逻辑化简**：true/false 传播、AND 吸收 true、OR 吸收 false、AND flatten、$nor 结构化简。
 */
export function simplify(ast: SelectorAST): SelectorAST {
    const context: FieldConditionMap = new Map();
    return simplifyNode(ast, context);
}

function simplifyNode(node: SelectorAST, context: FieldConditionMap): SelectorAST {
    if (isTrueNode(node) || isFalseNode(node)) {
        return node;
    }

    if (isFieldNode(node)) {
        return simplifyFieldAgainstContext(node, context);
    }

    if (isLogicalNode(node)) {
        switch (node.op) {
            case "$and":
                return simplifyAnd(node, context);
            case "$or":
                return simplifyOr(node, context);
            case "$nor":
                return simplifyNor(node, context);
        }
    }

    return node;
}

function simplifyAnd(node: LogicalNode, context: FieldConditionMap): SelectorAST {
    const layerAll = collectAndLayerFieldConditions(node);
    const resultChildren: SelectorAST[] = [];

    for (const child of node.children) {
        const childContext = isFieldNode(child)
            ? buildSiblingContext(context, layerAll, child)
            : buildLayerContext(context, layerAll);
        const simplified = simplifyNode(child, childContext);

        if (isFalseNode(simplified)) {
            return ASTNodeBuilder.falseNode();
        }
        if (isTrueNode(simplified)) {
            continue;
        }

        if (isFieldNode(simplified)) {
            resultChildren.push(simplified);
            continue;
        }

        if (isLogicalNode(simplified) && simplified.op === "$and") {
            resultChildren.push(...simplified.children);
            continue;
        }

        resultChildren.push(simplified);
    }

    if (resultChildren.length === 0) {
        return ASTNodeBuilder.trueNode();
    }
    if (resultChildren.length === 1) {
        return resultChildren[0];
    }
    return ASTNodeBuilder.logical("$and", resultChildren);
}

function simplifyOr(node: LogicalNode, context: FieldConditionMap): SelectorAST {
    const resultChildren: SelectorAST[] = [];

    for (const child of node.children) {
        const simplified = simplifyNode(child, context);

        if (isTrueNode(simplified)) {
            return ASTNodeBuilder.trueNode();
        }
        if (isFalseNode(simplified)) {
            continue;
        }

        resultChildren.push(simplified);
    }

    if (resultChildren.length === 0) {
        return ASTNodeBuilder.falseNode();
    }
    if (resultChildren.length === 1) {
        return resultChildren[0];
    }
    return ASTNodeBuilder.logical("$or", resultChildren);
}

/**
 * $nor 子句：空 context 做结构化简，父 context 判断是否可剪枝；恒 true 子句使 NOR 为 false。
 */
function simplifyNorChildrenWithContext(
    children: SelectorAST[],
    context: FieldConditionMap
): { kept: SelectorAST[]; hasAlwaysTrue: boolean } {
    const kept: SelectorAST[] = [];
    const emptyContext = new Map<string, FieldCondition[]>();

    for (const child of children) {
        const childNoCtx = simplifyNode(child, emptyContext);
        if (isFalseNode(childNoCtx)) {
            continue;
        }
        const childWithCtx = simplifyNode(child, context);
        if (isFalseNode(childWithCtx)) {
            continue;
        }
        // 子句在外层 $and 上下文中可化简（如与 sibling 字段矛盾）时必须保留化简结果，不能推入
        // childNoCtx；否则首轮输出仍含冗余支，再 parse 后 sibling 顺序/合并变化会导致二轮多剪一枝，破坏幂等。
        if (isTrueNode(childNoCtx) || isTrueNode(childWithCtx)) {
            return { kept: [], hasAlwaysTrue: true };
        }
        kept.push(childWithCtx);
    }

    return { kept, hasAlwaysTrue: false };
}

function simplifyNor(node: LogicalNode, context: FieldConditionMap): SelectorAST {
    const { kept, hasAlwaysTrue } = simplifyNorChildrenWithContext(node.children, context);

    if (hasAlwaysTrue) {
        return ASTNodeBuilder.falseNode();
    }
    if (kept.length === 0) {
        return ASTNodeBuilder.trueNode();
    }
    if (kept.length === 1) {
        return ASTNodeBuilder.logical("$nor", [kept[0]]);
    }
    // 扁平 $nor 子句列表（与 $nor:[{$or:[...]}] 语义等价）；标准形采用扁平形以利于一步幂等
    return ASTNodeBuilder.logical("$nor", kept);
}
