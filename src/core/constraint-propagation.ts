import { ASTNodeBuilder } from "../ast/builders";
import { isFieldNode } from "../ast/guards";
import type { FieldCondition, FieldNode, SelectorAST } from "../ast/types";
import {
    isConditionsImpossible,
    isParentChildImpossible,
    tightenWithParent,
} from "./conflicts-and-tighten";
import { areValuesEqual } from "./utils";

export type FieldConditionMap = Map<string, FieldCondition[]>;

export function cloneContext(context: FieldConditionMap): FieldConditionMap {
    const next = new Map<string, FieldCondition[]>();
    for (const [k, v] of context) {
        next.set(k, [...v]);
    }
    return next;
}

export function addToContext(context: FieldConditionMap, node: FieldNode): void {
    const existing = context.get(node.field) ?? [];
    context.set(node.field, [...existing, ...node.conditions]);
}

export function buildLayerContext(parentContext: FieldConditionMap, layerAll: FieldConditionMap): FieldConditionMap {
    const next = cloneContext(parentContext);
    for (const [field, conds] of layerAll) {
        const existing = next.get(field) ?? [];
        next.set(field, [...existing, ...conds]);
    }
    return next;
}

export function buildSiblingContext(
    parentContext: FieldConditionMap,
    layerAll: FieldConditionMap,
    self: FieldNode
): FieldConditionMap {
    const next = cloneContext(parentContext);
    const all = layerAll.get(self.field);
    if (!all) {
        return next;
    }

    const siblingsOnly = subtractConditions(all, self.conditions);
    if (siblingsOnly.length > 0) {
        const parentExisting = next.get(self.field) ?? [];
        next.set(self.field, [...parentExisting, ...siblingsOnly]);
    }
    return next;
}

export function subtractConditions(all: FieldCondition[], sub: FieldCondition[]): FieldCondition[] {
    if (sub.length === 0) {
        return [...all];
    }
    const remaining = [...all];

    for (const s of sub) {
        const idx = remaining.findIndex((c) => c.op === s.op && areValuesEqual(c.value, s.value));
        if (idx >= 0) {
            remaining.splice(idx, 1);
        }
    }

    return remaining;
}

/**
 * 在父级上下文中化简单个 FieldNode：冲突 → false；否则在支持的操作符上做等价收紧（见 tightenWithParent）。
 */
export function simplifyFieldAgainstContext(node: FieldNode, context: FieldConditionMap): SelectorAST {
    if (isConditionsImpossible(node.conditions)) {
        return ASTNodeBuilder.falseNode();
    }

    const parent = context.get(node.field);
    if (!parent) {
        return node;
    }

    if (isParentChildImpossible(parent, node.conditions)) {
        return ASTNodeBuilder.falseNode();
    }

    const tightened = tightenWithParent(parent, node.conditions);
    if (tightened.impossible) {
        return ASTNodeBuilder.falseNode();
    }
    if (tightened.changed && tightened.conditions.length === 0) {
        return ASTNodeBuilder.trueNode();
    }
    return tightened.changed ? { ...node, conditions: tightened.conditions } : node;
}

export function collectAndLayerFieldConditions(node: { children: SelectorAST[] }): FieldConditionMap {
    const layerAll = new Map<string, FieldCondition[]>();
    for (const child of node.children) {
        if (!isFieldNode(child)) {
            continue;
        }
        const existing = layerAll.get(child.field) ?? [];
        layerAll.set(child.field, [...existing, ...child.conditions]);
    }
    return layerAll;
}
