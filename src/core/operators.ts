/**
 * 字段级操作符分层（与 README「支持矩阵」一致）：
 *
 * **Modeled** — fieldConditionNormalize 会合并 / 冲突检测；conflicts / tighten 会按规则推理。
 * **Preserved** — parse 保留原 op，归并到 normalize 的 others，不参与区间与 $in 交集合并；
 *   simplify 的 tighten 会忽略这些 op（见 conditions.ts 中 SUPPORTED_TIGHTEN_OPS）。
 * **Unsupported at top level** — $expr / $where 等：parse 当前不展开，顶层键被跳过（与 Mongo 行为一致需注意）。
 */

const MODELED_FIELD_OPERATORS = new Set<string>([
    "$eq",
    "$gt",
    "$gte",
    "$lt",
    "$lte",
    "$in",
    "$nin",
    "$exists",
]);

/** 参与单字段语义合并与冲突推理的操作符（fieldConditionNormalize 的 switch 分支）。 */
export function isModeledFieldOperator(op: string): boolean {
    return MODELED_FIELD_OPERATORS.has(op);
}
