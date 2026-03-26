import { isDeepStrictEqual } from "node:util";
import type { SelectorAST } from "./ast/types";
import type { RewriteOptions, Selector } from "./types";
import { canonicalize, fieldConditionNormalize, normalize, predicateMerge, simplify } from "./core";
import { compileSelector } from "./operations/compile";
import { parseSelector } from "./operations/parse";

/** 单轮 AST 管线（供内部固定点循环调用）。 */
function rewriteAstOnce(ast: SelectorAST, options?: RewriteOptions): SelectorAST {
    const normalized = normalize(ast);
    const merged = predicateMerge(normalized);
    const fieldNormalized = fieldConditionNormalize(merged);
    const simplified = simplify(fieldNormalized);
    const mergedAfterSimplify = predicateMerge(simplified);
    const fieldAfterSimplify = fieldConditionNormalize(mergedAfterSimplify);
    return canonicalize(fieldAfterSimplify, options?.indexSpecs);
}

/**
 * 内部最多迭代次数：每轮为完整 normalize→…→canonicalize；`canonicalize` 将字段子句排到前、逻辑子句在后，
 * 可能使下一轮 `simplify` 才在同一 `$and` 层看到 sibling 字段上下文（例如先出现 `x:false` 再化简 `$nor:[{x:true}]`）。
 */
const REWRITE_AST_MAX_PASSES = 8;

/**
 * 仅对 AST 做重写（不 parse、不 compile），便于复用 AST 重写逻辑或做 AST 级测试/模糊测试。
 *
 * **单轮管线**：normalize → predicateMerge → fieldConditionNormalize → simplify → predicateMerge →
 * fieldConditionNormalize → canonicalize。
 *
 * simplify 会打平 `$and` 并可能把原先隔在嵌套里的同字段 `FieldNode` 变成兄弟节点，故在 simplify
 * 之后必须再跑一轮 merge + 字段规范化，否则 compile 会输出「同字段拆成多条 $and 子句」，再 parse
 * 时会被合并成单字段多 op，与首轮 AST 不一致。
 *
 * **固定点**：对上述管线反复应用直至 AST 稳定或达到 `REWRITE_AST_MAX_PASSES`（对外仍是一次 API 调用）。
 * 保证在已支持范围内 `rewriteAst(rewriteAst(x))` 与 `rewriteAst(x)` 结构一致。
 *
 * 在已建模操作符子集内输出与输入**语义等价**的 AST；可判定矛盾时为 FalseNode。
 * `options.indexSpecs` 仅影响 canonicalize 中 `$and` 下字段节点顺序，不改变语义。
 */
export function rewriteAst(ast: SelectorAST, options?: RewriteOptions): SelectorAST {
    let current: SelectorAST = ast;
    for (let pass = 0; pass < REWRITE_AST_MAX_PASSES; pass += 1) {
        const next = rewriteAstOnce(current, options);
        if (isDeepStrictEqual(next, current)) {
            return next;
        }
        current = next;
    }
    return current;
}

/**
 * 重写 MongoDB 查询过滤器：结构规范化、同字段条件合并、逻辑化简与可判定冲突下的 IMPOSSIBLE_SELECTOR。
 *
 * **语义**（已建模字段操作符，见 README 矩阵）：输出与输入匹配同一文档集；若可证明不可满足则返回
 * `IMPOSSIBLE_SELECTOR`。未建模字段操作符透传，本库不对其做语义变换承诺。
 */
export function rewriteQuerySelector(selector: Selector, options?: RewriteOptions): Selector {
    const ast = parseSelector(selector);
    const canonical = rewriteAst(ast, options);
    return compileSelector(canonical);
}
