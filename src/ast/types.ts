export type SelectorAST = LogicalNode | FieldNode | TrueNode | FalseNode;

export type LogicalOperator = "$and" | "$or" | "$nor";

export interface LogicalNode {
    type: "logical";
    op: LogicalOperator;
    children: SelectorAST[];
}

export interface FieldNode {
    type: "field";
    field: string;
    conditions: FieldCondition[];
}

export interface TrueNode {
    type: "true";
}

export interface FalseNode {
    type: "false";
}

/**
 * 未在 fieldConditionNormalize 中做区间 / $in 合并的字段操作符（含未知 op）：
 * parse 保真保留，compile 原样输出；不参与 modeled 推理。
 */
export interface PassthroughFieldCondition {
    op: string;
    value: unknown;
}

export type FieldCondition =
    | EqCondition
    | NeCondition
    | CompareCondition
    | InCondition
    | ExistsCondition
    | RegexCondition
    | AllCondition
    | SizeCondition
    | PassthroughFieldCondition;

export interface EqCondition {
    op: "$eq";
    value: unknown;
}

export interface NeCondition {
    op: "$ne";
    value: unknown;
}

export interface CompareCondition {
    op: "$gt" | "$gte" | "$lt" | "$lte";
    value: number | Date;
}

export interface InCondition {
    op: "$in" | "$nin";
    value: unknown[];
}

export interface ExistsCondition {
    op: "$exists";
    value: boolean;
}

export interface RegexCondition {
    op: "$regex";
    value: RegExp | string;
}

export interface AllCondition {
    op: "$all";
    value: unknown[];
}

export interface SizeCondition {
    op: "$size";
    value: number;
}
