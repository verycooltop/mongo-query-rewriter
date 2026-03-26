# mongo-query-rewriter

**English** | [中文](README.zh-CN.md)

A small library that **normalizes** MongoDB query selectors: merges same-field predicates where it understands the semantics, **simplifies** boolean structure (`$and` / `$or` / `$nor`), propagates constraints in a semantics-preserving way, and turns **provable contradictions** into a single **impossible** filter.

Pipeline (single pass):

`normalize → predicateMerge → fieldConditionNormalize → simplify → predicateMerge → fieldConditionNormalize → canonicalize`

`rewriteQuerySelector` does `parse →` the above (repeated until the AST is stable, bounded) `→ compile`. The extra merge/normalize after `simplify` avoids duplicate field keys across `$and` array elements; the internal loop handles cases where `canonicalize` must reorder siblings before another `simplify` can apply context.

---

## Install

```bash
npm install mongo-query-rewriter
```

---

## What it does

| Capability | Description |
|------------|-------------|
| **Normalization** | Flattens nested `$and`, folds single-child logical nodes, stable ordering. |
| **Predicate merge** | Under `$and`, merges multiple `FieldNode`s on the same field into one (conditions concatenated, then normalized). |
| **Field condition merge** | For **modeled** operators, merges ranges, intersects `$in`, detects conflicts. |
| **Simplify** | Truthiness on `true`/`false` nodes, OR/NOR pruning, AND flattening; sibling/parent **constraint propagation** only for operators the engine models (see below). |
| **Conflict → impossible** | If the filter is unsatisfiable under the modeled rules, returns `IMPOSSIBLE_SELECTOR`. |
| **Canonicalize** | Final structural pass: flatten `$and`/`$or`, unwrap `$nor:[{$or:…}]`, stable sort of `$and` / `$or` / `$nor` children (where commutative), field-condition operator order. |

---

## Semantic guarantee

### `rewriteQuerySelector(selector, options?)`

For queries that use only **modeled** field operators (and the logical operators `$and` / `$or` / `$nor`), the rewritten selector matches the **same set of documents** as the original in MongoDB.

If a **contradiction** is detected among modeled conditions on the same field (or in propagated contexts), the result is **`IMPOSSIBLE_SELECTOR`** (`{ _id: { $exists: false } }`), which matches no documents—equivalent to an unsatisfiable filter.

**Passthrough operators** (see matrix): the library **preserves** the operator and value through parse/compile and does **not** claim to optimize or merge them. It also does **not** infer conflicts involving them beyond what existing modeled rules already detect.

**Not guaranteed:** equivalence for top-level `$expr`, `$where`, `$jsonSchema`, or other operators that are not represented as normal field predicates in this AST. Those keys are ignored at parse time when they appear as top-level selector keys (same as before).

**Idempotency (supported range):** For **modeled** field operators and `$and` / `$or` / `$nor`, property tests assert **`rewrite(rewrite(q))` deep-equals `rewrite(q)`** on a random selector generator (`selectorArb`). Passthrough-only shapes are less heavily fuzzed; top-level keys not represented in the AST are out of scope. Implementation detail: `rewriteAst` may run the AST pipeline multiple times internally until stable (capped), but **one** `rewriteQuerySelector` call returns the fixed point.

Contributor notes: [docs/CANONICAL_FORM.md](docs/CANONICAL_FORM.md).

---

## Operator support matrix

### A — Fully modeled (merge, conflict detection, tighten)

`$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`

(`$ne` is handled in conflict/tighten paths but not merged the same way as ranges in `fieldConditionNormalize`; it is still passed through safely.)

### B — Preserved, not optimized

Parsed and emitted as-is; **no** range/`$in` merging in `fieldConditionNormalize`; **ignored** by tighten’s supported-op filter (they stay on the child unchanged).

Examples: `$regex`, `$size`, `$all`, `$elemMatch`, `$mod`, `$type`, and **any other** field-level `$…` operator not in group A.

### C — Unsupported / out of scope for this rewriter

`$where`, `$expr` (no full expression AST here), and similar. Top-level `$comment` / `$text` are left as non-filter clauses (parsed as “no constraint” for the filter shape this library builds).

---

## What this library does **not** do

- No execution-plan analysis or index **recommendation**.
- No guarantee of optimizing passthrough operators (group B).
- No full MongoDB query language coverage.

---

## Options

### `RewriteOptions`

```ts
interface RewriteOptions {
    /** Only affects order of `$and` children in canonicalize — not matching semantics */
    indexSpecs?: IndexSpec[];
}
```

Example:

```js
const { rewriteQuerySelector } = require("mongo-query-rewriter");

const rewritten = rewriteQuerySelector(
    { $and: [{ b: 1 }, { a: 2 }] },
    { indexSpecs: [{ key: { a: 1, b: 1 } }] }
);
// `$and` children may be ordered with `a` before `b` when index keys suggest it
```

---

## API

### `rewriteQuerySelector(selector, options?)`

Main entry: parse, rewrite pipeline, compile to a plain selector object. Does not mutate `selector`.

### `rewriteAst(ast, options?)`

Rewrites an existing **AST** only (no parse/compile). Applies the same bounded fixed-point normalization as `rewriteQuerySelector` (without the parse/compile shell). For advanced use or tests when you already use `parseSelector` from the operations layer. Most applications should use `rewriteQuerySelector`.

### `IMPOSSIBLE_SELECTOR`

`{ _id: { $exists: false } }` — returned when the filter is provably unsatisfiable under modeled rules.

### Types

```ts
import type { Selector, IndexSpec, RewriteOptions } from "mongo-query-rewriter";
```

---

## Examples

### Merge and canonicalize

```js
const selector = {
    $and: [
        { status: "active" },
        { score: { $gte: 0 } },
        { score: { $lte: 100 } },
    ],
};
rewriteQuerySelector(selector);
// → { $and: [ { status: "active" }, { score: { $gte: 0, $lte: 100 } } ] } (order may vary)
```

### Contradiction → impossible

```js
rewriteQuerySelector({ $and: [{ a: 1 }, { a: 2 }] });
// → IMPOSSIBLE_SELECTOR
```

### Passthrough unknown / preserved operators

```js
rewriteQuerySelector({ arr: { $size: 3 } });
// → { arr: { $size: 3 } }  // not turned into bogus $eq
```

### `$nor`

```js
rewriteQuerySelector({ $nor: [{ status: "deleted" }] });
// structure simplified/canonicalized; semantics preserved
```

### Stable after rewrite (common case)

```js
const q = { $and: [{ a: { $gt: 1 } }, { a: { $lt: 10 } }] };
const once = rewriteQuerySelector(q);
const twice = rewriteQuerySelector(once);
// deepEqual(once, twice) for modeled logical + field operators (see idempotency note above)
```

---

## License

ISC. See [LICENSE](LICENSE).
