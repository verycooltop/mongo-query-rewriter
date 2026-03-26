/**
 * MongoDB 选择器类型（与官方 FilterQuery 结构兼容，不依赖 mongodb 驱动时可单独使用）
 */
export type Selector<T = unknown> = {
    $and?: Selector<T>[];
    $or?: Selector<T>[];
    $nor?: Selector<T>[];
    $comment?: string;
    $text?: { $search: string;[key: string]: unknown };
    $where?: string | ((this: unknown) => boolean);
} & Record<string, unknown>;

/**
 * 不可满足选择器（Spec §2.2）：对所有 doc 有 match(IMPOSSIBLE_SELECTOR, doc) = false。
 * 编译阶段 FalseNode 输出此值。
 */
export const IMPOSSIBLE_SELECTOR: Selector = { _id: { $exists: false } } as Selector;

/**
 * 集合索引描述，用于打平时按索引键顺序排列条件以提升索引利用率
 */
export interface IndexSpec {
    /** 索引键：字段名 -> 1 升序 / -1 降序 */
    key: Record<string, 1 | -1>;
    /** 可选：索引名称，用于日志或策略选择 */
    name?: string;
}

/**
 * `rewriteQuerySelector` / `rewriteAst` 的可选参数。
 * `indexSpecs` 仅传入 canonicalize：影响 `$and` 下 FieldNode 的**排序**，不改变匹配语义。
 */
export interface RewriteOptions {
    indexSpecs?: IndexSpec[];
}

/**
 * 某字段条件值标准化后的「操作符-值」对，用于冲突检测与合并比较
 */
export interface OperatorValuePair {
    operator: string;
    value: unknown;
}
