/**
 * 字段 bundle 级谓词归一化入口（与 `passes/normalize-predicate` 中字段分支使用同一套管线）。
 */
export {
    normalizeFieldPredicateBundle,
    compileLocalNormalizeResultToAst,
    type NormalizeFieldPredicateBundleOptions,
} from "./normalize-field-predicate-bundle";
