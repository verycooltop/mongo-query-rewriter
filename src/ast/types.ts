export type QueryNode = LogicalNode | FieldNode | TrueNode | FalseNode | OpaqueNode;

/**
 * Compound query node for `$and` / `$or`.
 * The `type` discriminant is `"logical"` for stable AST hashing (not a `NormalizeLevel` value).
 */
export interface LogicalNode {
    type: "logical";
    op: "$and" | "$or";
    children: QueryNode[];
}

export interface FieldPredicate {
    op: string;
    value: unknown;
    opaque?: boolean;
}

export interface FieldNode {
    type: "field";
    field: string;
    predicates: FieldPredicate[];
}

export interface TrueNode {
    type: "true";
}

export interface FalseNode {
    type: "false";
}

export interface OpaqueNode {
    type: "opaque";
    raw: unknown;
    reason?: string;
}
