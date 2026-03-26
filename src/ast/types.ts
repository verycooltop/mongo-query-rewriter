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

export type FieldCondition =
    | EqCondition
    | NeCondition
    | CompareCondition
    | InCondition
    | ExistsCondition
    | RegexCondition
    | AllCondition
    | SizeCondition;

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
