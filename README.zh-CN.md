# mongo-query-rewriter

[English](README.md) | **中文**

用于 **规范化** MongoDB 查询选择器的库：在可推理的语义范围内合并同字段谓词、**化简** `$and` / `$or` / `$nor` 结构、在等价前提下做约束传播，并在**可证明矛盾**时输出**不可满足**过滤器。

单遍 AST 管线：

`normalize → predicateMerge → fieldConditionNormalize → simplify → predicateMerge → fieldConditionNormalize → canonicalize`

`rewriteQuerySelector` 为 `parse →` 上述步骤（在 AST 稳定前可重复执行，有上限）`→ compile`。`simplify` 之后追加 merge/字段归一，避免同一 `$and` 下多条子句重复写字段键；内部固定点用于处理「先 canonical 排序 sibling，下一轮才能用上下文化简」的情况。

---

## 安装

```bash
npm install mongo-query-rewriter
```

---

## 能力概览

| 能力 | 说明 |
|------|------|
| **规范化** | 打平嵌套 `$and`、单子逻辑节点折叠、稳定排序 |
| **谓词合并** | 在 `$and` 内合并同字段的多个 `FieldNode`，再交给字段条件归一 |
| **字段条件归一** | 对 **已建模** 操作符做区间、`$in` 交集与冲突检测 |
| **化简** | true/false 传播、OR/NOR 剪枝、AND 打平；sibling/父级 **约束传播** 仅作用于引擎声明支持的操作符 |
| **冲突** | 在已建模规则下不可满足时返回 `IMPOSSIBLE_SELECTOR` |
| **Canonicalize** | 最终结构收口：打平 `$and`/`$or`、收拢 `$nor:[{$or:…}]`、对可交换的 `$or`/`$nor` 子句稳定排序、字段内操作符规范顺序 |

---

## 语义保证

### `rewriteQuerySelector(selector, options?)`

在仅使用 **已建模** 字段操作符（以及 `$and` / `$or` / `$nor`）时，重写后的选择器与原始选择在 MongoDB 中匹配**同一文档集合**。

若在已建模条件之间出现**可证明的矛盾**（含传播上下文），则返回 **`IMPOSSIBLE_SELECTOR`**（`{ _id: { $exists: false } }`），与「不可满足过滤器」一致。

**透传类操作符**（见下表）：库会 **保留** 原操作符与取值，**不承诺** 做合并或优化；除已有建模规则外，**不对其做冲突推断**。

**不保证：** 顶层 `$expr`、`$where`、`$jsonSchema` 等与「普通字段谓词 AST」无关的能力；这些顶层键在 parse 阶段会被跳过（与此前行为一致）。

**幂等（当前 fuzz 覆盖范围）：** 对 **已建模** 字段操作符与 `$and` / `$or` / `$nor`，性质测试断言 **`rewrite(rewrite(q))` 与 `rewrite(q)` 深相等**（生成器 `selectorArb`）。透传为主的形状 fuzz 较少；parse 不表示的顶层键不在保证范围内。实现上 `rewriteAst` 可在单次 API 调用内执行多遍管线直至稳定（有上限）。详见 [docs/CANONICAL_FORM.md](docs/CANONICAL_FORM.md)。

---

## 操作符支持矩阵

### A — 完整建模（合并、冲突、收紧参与）

`$eq`、`$gt`、`$gte`、`$lt`、`$lte`、`$in`、`$nin`、`$exists`

（`$ne` 在冲突/收紧路径中有处理，但在 `fieldConditionNormalize` 中与区间类合并方式不同，仍以安全透传为主。）

### B — 透传、不优化

原样 parse/compile；不参与区间与 `$in` 的合并推理；tighten 中的「支持操作符」集合不包含它们，子条件保持原样。

例如：`$regex`、`$size`、`$all`、`$elemMatch`、`$mod`、`$type`，以及其它未列入 A 的字段级 `$…` 操作符。

### C — 本重写器不覆盖

`$where`、`$expr`（无完整表达式 AST）等。顶层 `$comment` / `$text` 不作为本库构建的过滤条件参与解析。

---

## 明确不做的范围

- 不做执行计划分析或索引**推荐**（除非自行扩展；可选 `indexSpecs` **只改排序**）。
- 不保证对 B 类操作符做「优化」。
- 不覆盖完整 Mongo 查询语言。

---

## 可选参数 `RewriteOptions`

```ts
interface RewriteOptions {
    /** 仅影响 canonicalize 中 `$and` 子节点顺序，不改变匹配语义 */
    indexSpecs?: IndexSpec[];
}
```

```js
const { rewriteQuerySelector } = require("mongo-query-rewriter");

rewriteQuerySelector(
    { $and: [{ b: 1 }, { a: 2 }] },
    { indexSpecs: [{ key: { a: 1, b: 1 } }] }
);
```

---

## API

### `rewriteQuerySelector(selector, options?)`

主入口：解析 → 重写管线 → 编译为普通对象。不修改入参 `selector`。

### `rewriteAst(ast, options?)`

仅重写 **AST**（不 parse、不 compile），与 `rewriteQuerySelector` 使用相同的**有界固定点**规范化。适合已有 AST 或配合 `parseSelector` 的高级用法；一般业务只用 `rewriteQuerySelector` 即可。

### `IMPOSSIBLE_SELECTOR`

`{ _id: { $exists: false } }`，表示在已建模规则下不可满足。

### 类型

```ts
import type { Selector, IndexSpec, RewriteOptions } from "mongo-query-rewriter";
```

---

## 示例

### 合并与规范化

```js
const selector = {
    $and: [
        { status: "active" },
        { score: { $gte: 0 } },
        { score: { $lte: 100 } },
    ],
};
rewriteQuerySelector(selector);
// → { $and: [ { status: "active" }, { score: { $gte: 0, $lte: 100 } } ] }（顺序可能因 canonicalize 而异）
```

### 冲突 → 不可满足

```js
rewriteQuerySelector({ $and: [{ a: 1 }, { a: 2 }] });
// → IMPOSSIBLE_SELECTOR
```

### 未知 / 透传操作符

```js
rewriteQuerySelector({ arr: { $size: 3 } });
// → { arr: { $size: 3 } }  // 不会错误变成 $eq
```

### 重写后稳定（常见形状）

```js
const q = { $and: [{ a: { $gt: 1 } }, { a: { $lt: 10 } }] };
const once = rewriteQuerySelector(q);
const twice = rewriteQuerySelector(once);
// 已建模逻辑 + 字段操作符下通常 deepStrictEqual(once, twice)（见上文幂等说明）
```

---

## 许可证

ISC。见 [LICENSE](LICENSE)。
