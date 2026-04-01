# Mongo Query Normalizer

**English** | [中文](README.zh-CN.md)

An **observable, level-based** normalizer for MongoDB query objects. It stabilizes query **shape** at the conservative default, and adds **`predicate`** and **`scope`** levels with **documented, test-backed contracts** (see [SPEC.md](SPEC.md) and [docs/normalization-matrix.md](docs/normalization-matrix.md) / [中文](docs/normalization-matrix.zh-CN.md)). It returns **predictable** output plus **metadata**—not a MongoDB planner optimizer.

> **Default posture:** **`shape`** is the smallest, structural-only pass and the recommended default for the widest production use. **`predicate`** and **`scope`** apply additional conservative rewrites under explicit contracts; adopt them when you need those transforms and accept their modeled-operator scope (opaque operators stay preserved).
>
> **As of `v0.2.0`:** predicate rewrites are intentionally narrowed to an explicitly validated surface (`eq.eq`, `eq.ne`, `eq.in`, `eq.range`, `range.range`). High-risk combinations (for example null-vs-missing, array-sensitive semantics, `$exists`/`$nin`, object-vs-dotted-path mixes, opaque mixes) remain conservative by design.

---

## Why it exists

- Query **shape** diverges across builders and hand-written filters.
- Outputs can be **hard to compare**, log, or diff without a stable pass.
- You need a **low-risk normalization layer** that defaults to conservative behavior.

This library does **not** promise to make queries faster or to pick optimal indexes.

---

## Features

- **Level-based** normalization (`shape` → `predicate` → `scope`)
- **Conservative default**: `shape` only out of the box (lowest-risk structural pass)
- **Observable** `meta`: changed flags, applied/skipped rules, warnings, hashes, optional stats
- **Stable / idempotent** output when rules apply (same options)
- **Opaque fallback** for unsupported operators (passthrough, not semantically rewritten)

---

## Install

```bash
npm install mongo-query-normalizer
```

---

## Quick start

```ts
import { normalizeQuery } from "mongo-query-normalizer";

const result = normalizeQuery({
    $and: [{ status: "open" }, { $and: [{ priority: { $gte: 1 } }] }],
});

console.log(result.query);
console.log(result.meta);
```

---

## Complete usage guide

### 1) Minimal usage (recommended default)

```ts
import { normalizeQuery } from "mongo-query-normalizer";

const { query: normalizedQuery, meta } = normalizeQuery(inputQuery);
```

- Without `options`, default behavior is `level: "shape"`.
- Best for low-risk structural stabilization: logging, cache-key normalization, query diff alignment.

### 2) Pick a level explicitly

```ts
normalizeQuery(inputQuery, { level: "shape" }); // structural only (default)
normalizeQuery(inputQuery, { level: "predicate" }); // modeled predicate cleanup
normalizeQuery(inputQuery, { level: "scope" }); // scope propagation / conservative pruning
```

- `shape`: safest structural normalization.
- `predicate`: dedupe / merge / contradiction collapse for modeled operators.
- `scope`: adds inherited-constraint propagation and conservative branch decisions on top of `predicate`.

### 3) Full `options` example

```ts
import { normalizeQuery } from "mongo-query-normalizer";

const result = normalizeQuery(inputQuery, {
    level: "scope",
    rules: {
        // shape-related
        flattenLogical: true,
        removeEmptyLogical: true,
        collapseSingleChildLogical: true,
        dedupeLogicalChildren: true,
        // predicate-related
        dedupeSameFieldPredicates: true,
        mergeComparablePredicates: true,
        collapseContradictions: true,
        // ordering-related
        sortLogicalChildren: true,
        sortFieldPredicates: true,
        // scope observe-only rule (no structural hoist)
        detectCommonPredicatesInOr: true,
    },
    safety: {
        maxNormalizeDepth: 32,
        maxNodeGrowthRatio: 1.5,
    },
    observe: {
        collectWarnings: true,
        collectMetrics: false,
        collectPredicateTraces: false,
        collectScopeTraces: false,
    },
    predicate: {
        safetyPolicy: {
            // override only fields you care about
        },
    },
    scope: {
        safetyPolicy: {
            // override only fields you care about
        },
    },
});
```

### 4) Inspect resolved runtime options

```ts
import { resolveNormalizeOptions } from "mongo-query-normalizer";

const resolvedOptions = resolveNormalizeOptions({
    level: "predicate",
    observe: { collectMetrics: true },
});

console.log(resolvedOptions);
```

- Useful for debugging why a rule is enabled/disabled.
- Useful for logging a startup-time normalization config snapshot.

### 5) Consume `query` and `meta`

```ts
const { query: normalizedQuery, meta } = normalizeQuery(inputQuery, options);

if (meta.bailedOut) {
    logger.warn({ reason: meta.bailoutReason }, "normalization bailed out");
}

if (meta.changed) {
    logger.info(
        {
            level: meta.level,
            beforeHash: meta.beforeHash,
            afterHash: meta.afterHash,
            appliedRules: meta.appliedRules,
        },
        "query normalized"
    );
}
```

- `query`: normalized query object.
- `meta`: observability data (changed flag, rule traces, warnings, hashes, optional stats/traces).

### 6) Typical integration patterns

```ts
// A. Normalize centrally in data-access layer
export function normalizeForFind(rawFilter) {
    return normalizeQuery(rawFilter, { level: "shape" }).query;
}

// B. Use stronger convergence in offline paths
export function normalizeForBatch(rawFilter) {
    return normalizeQuery(rawFilter, { level: "predicate" }).query;
}
```

- Prefer `shape` for online request paths.
- Enable `predicate` / `scope` when there is clear benefit plus test coverage.

### 7) Errors and boundaries

- Invalid `level` throws an error (for example, typos).
- Unsupported or unknown operators are generally preserved as opaque; semantic merge behavior is not guaranteed for them.
- The library target is stability and observability, not query planning optimization.

---

## Default behavior

- **Default `level` is `"shape"`** (see `resolveNormalizeOptions()`).
- By default there is **no** predicate merge at `shape`. At **`scope`**, core work is inherited-constraint propagation and conservative branch decisions; **`detectCommonPredicatesInOr`** is an **optional, observe-only** rule (warnings / traces)—never a structural hoist.
- The goal is **stability and observability**, not “smart optimization.”

---

## Choosing a level

- Use **`shape`** when you only need structural stabilization (flatten, dedupe children, ordering, etc.).
- Use **`predicate`** when you need same-field dedupe, modeled comparable merges, and contradiction collapse on **modeled** operators; opaque subtrees stay preserved.
- Use **`scope`** when you need inherited-constraint propagation, conservative pruning, and narrow coverage elimination as described in the spec and matrix. **`detectCommonPredicatesInOr`** (when enabled) is **observe-only** and does not rewrite structure.

Authoritative behavior boundaries are in **[SPEC.md](SPEC.md)**, **[docs/normalization-matrix.md](docs/normalization-matrix.md)**, and contract tests under **`test/contracts/`**—not informal README prose alone.

---

## Levels

### `shape` (default)

**Recommended default** for the lowest-risk path. Safe structural normalization only, for example:

- flatten compound (`$and` / `$or`) nodes  
- remove empty compound nodes  
- collapse single-child compound nodes  
- dedupe compound children  
- canonical ordering  

### `predicate`

On top of `shape`, conservative **predicate** cleanup on **modeled** operators:

- dedupe same-field predicates  
- merge comparable predicates where modeled  
- collapse clear contradictions to an unsatisfiable filter  
- merge **direct** `$and` children that share the same field name before further predicate work (so contradictions like `{ $and: [{ a: 1 }, { a: 2 }] }` can be detected)

### `scope`

On top of `predicate`:

- **Inherited constraint propagation** (phase-1 allowlist) and **conservative branch pruning**; **coverage elimination** only in narrow, tested cases when policy allows  
- Optional **`detectCommonPredicatesInOr`**: observe-only (warnings / traces); **no** structural rewrite

---

## `meta` fields

| Field | Meaning |
|--------|---------|
| `changed` | Structural/predicate output differs from input (hash-based) |
| `level` | Resolved normalization level |
| `appliedRules` / `skippedRules` | Rule tracing |
| `warnings` | Non-fatal issues when `observe.collectWarnings` is enabled (rule notices, detection text, etc.) |
| `bailedOut` | Safety stop; output reverts to pre-pass parse for that call |
| `bailoutReason` | Why bailout happened, if any |
| `beforeHash` / `afterHash` | Stable hashes for diffing |
| `stats` | Optional before/after tree metrics (`observe.collectMetrics`) |
| `predicateTraces` | When `observe.collectPredicateTraces`: per-field planner / skip / contradiction signals |
| `scopeTrace` | When `observe.collectScopeTraces`: constraint extraction rejections + scope decision events |

---

## Unsupported / opaque behavior

Structures such as **`$nor`**, **`$regex`**, **`$not`**, **`$elemMatch`**, **`$expr`**, geo/text queries, and **unknown** operators are generally treated as **opaque**: they pass through or are preserved without full semantic rewriting. They are **not** guaranteed to participate in merge or contradiction logic.

---

## Stability policy

The **public contract** is:

- `normalizeQuery`
- `resolveNormalizeOptions`
- the exported **types** listed in the package entry

**Not** part of the public contract: internal AST, `parseQuery`, `compileQuery`, individual rules/passes, or utilities. They may change between versions.

---

## Principles (explicit)

1. Default level is **`shape`**.  
2. **`predicate`** / **`scope`** may change structure while aiming for **semantic equivalence** on **modeled** operators.  
3. **Opaque** nodes are not rewritten semantically.  
4. Output should be **idempotent** under the same options when no bailout occurs.  
5. This library is **not** the MongoDB query planner or an optimizer.

---

## Example scenarios

**Online main path** — use default (`shape`); this remains the most production-safe baseline in `v0.2.0`:

```ts
normalizeQuery(query);
```

**Predicate or scope** — pass `level` explicitly; review [SPEC.md](SPEC.md) and contract tests for supported vs preserved patterns:

```ts
normalizeQuery(query, { level: "predicate" });
```

---

## Public API

```ts
normalizeQuery(query, options?) => { query, meta }
resolveNormalizeOptions(options?) => ResolvedNormalizeOptions
```

Types: `NormalizeLevel`, `NormalizeOptions`, `NormalizeRules`, `NormalizeSafety`, `NormalizeObserve`, `ResolvedNormalizeOptions`, `NormalizeResult`, `NormalizeStats`, `PredicateSafetyPolicy`, `ScopeSafetyPolicy`, trace-related types (see package exports).

---

## Testing

### Test layout

This repository organizes tests by **API surface**, **normalization level**, and **cross-level contracts**, while preserving deeper semantic and regression suites.

### Directory responsibilities

#### `test/api/`

Tests the public API and configuration surface.

Put tests here when they verify:

* `normalizeQuery` return shape and top-level behavior
* `resolveNormalizeOptions`
* package exports

Do **not** put level-specific normalization behavior here.

---

#### `test/levels/`

Tests the behavior boundary of each `NormalizeLevel`.

Current levels:

* `shape`
* `predicate`
* `scope`

Each level test file should focus on four things:

1. positive capabilities of that level
2. behavior explicitly not enabled at that level
3. contrast with the adjacent level(s)
4. a small number of representative contracts for that level

Prefer asserting:

* normalized query structure
* observable cross-level differences
* stable public metadata

Avoid overfitting to:

* exact warning text
* exact internal rule IDs
* fixed child ordering unless ordering itself is part of the contract

---

#### `test/contracts/`

Tests contracts that should hold across levels, or default behavior that is separate from any single level.

Put tests here when they verify:

* default level behavior
* idempotency across all levels
* output invariants across all levels
* opaque subtree preservation across all levels
* formal **`predicate` / `scope`** contracts (supported merges, opaque preservation, scope policy guards, rule toggles)—see `test/contracts/predicate-scope-stable-contract.test.js`

Use `test/helpers/level-contract-runner.js` for all-level suites.

---

#### `test/semantic/`

Tests semantic equivalence against execution behavior.
These tests validate that normalization preserves meaning.

This directory is intentionally separate from `levels/` and `contracts/`.

---

#### `test/property/`

Tests property-based and metamorphic behavior.

Use this directory for:

* randomized semantic checks
* metamorphic invariants
* broad input-space validation

Do not use it as the primary place to express level boundaries.

---

#### `test/regression/`

Tests known historical failures and hand-crafted regression cases.

Add a regression test here when fixing a bug that should stay fixed.

---

#### `test/performance/`

Tests performance guards or complexity-sensitive behavior.

These tests should stay focused on performance-related expectations, not general normalization structure.

---

### Helper files

#### `test/helpers/level-runner.js`

Shared helper for running a query at a specific level.

#### `test/helpers/level-cases.js`

Shared fixed inputs used across level tests.
Prefer adding reusable representative cases here instead of duplicating inline fixtures.

#### `test/helpers/level-contract-runner.js`

Shared `LEVELS` list and helpers for all-level contract suites.

---

### Rules for adding new tests

#### When adding a new normalization rule

Ask first:

* Is this a public API behavior?

  * Add to `test/api/`
* Is this enabled only at a specific level?

  * Add to `test/levels/`
* Should this hold for all levels?

  * Add to `test/contracts/`
* Is this about semantic preservation or randomized validation?

  * Add to `test/semantic/` or `test/property/`
* Is this a bug fix for a previously broken case?

  * Add to `test/regression/`

---

#### When adding a new level

At minimum, update all of the following:

1. add a new `test/levels/<level>-level.test.js`
2. register the level in `test/helpers/level-contract-runner.js`
3. ensure all-level contract suites cover it
4. add at least one contrast case against the adjacent level

---

### Testing style guidance

Prefer:

* example-based tests for level boundaries
* query-shape assertions
* contrast tests between adjacent levels
* shared fixtures for representative cases

Avoid:

* coupling level tests to unstable implementation details
* repeating the same fixture with only superficial assertion changes
* putting default-level behavior inside a specific level test
* mixing exports/API tests with normalization behavior tests

---

### Practical rule of thumb

* `api/` answers: **how the library is used**
* `levels/` answers: **what each level does and does not do**
* `contracts/` answers: **what must always remain true**
* `semantic/property/regression/performance` answer: **whether the system remains correct, robust, and efficient**

---

### npm scripts and property-test tooling

Randomized semantic tests use **`mongodb-memory-server`** + **`fast-check`** to compare **real** `find` results (same `sort` / `skip` / `limit`, projection `{ _id: 1 }`) before and after `normalizeQuery` on a **fixed document schema** and a **restricted operator set** (see `test/helpers/arbitraries.js`). They assert matching **`_id` order**, **idempotency** of the returned `query`, and (for opaque operators) **non-crash / stable second pass** only. **`FC_SEED` / `FC_RUNS` defaults are centralized in `test/helpers/fc-config.js`** (also re-exported from `arbitraries.js`).

To **avoid downloading** a MongoDB binary, set one of **`MONGODB_BINARY`**, **`MONGOD_BINARY`**, or **`MONGOMS_SYSTEM_BINARY`** to your local `mongod` path before running semantic tests (see `test/helpers/mongo-fixture.js`).

* **`npm run test`** — build, then `test:unit`, then `test:semantic`.
* **`npm run test:api`** — `test/api/**/*.test.js` only.
* **`npm run test:levels`** — `test/levels/**/*.test.js` and `test/contracts/*.test.js`.
* **`npm run test:unit`** — all `test/**/*.test.js` except `test/semantic/**`, `test/regression/**`, and `test/property/**` (includes `test/api/**`, `test/levels/**`, `test/contracts/**`, `test/performance/**`, and other unit tests).
* **`npm run test:semantic`** — semantic + regression + property folders (defaults when env unset: see `fc-config.js`).
* **`npm run test:semantic:quick`** — lower **`FC_RUNS`** (script sets `45`) + **`FC_SEED=42`**, still runs `test/regression/**` and `test/property/**`.
* **`npm run test:semantic:ci`** — CI-oriented env (`FC_RUNS=200`, `FC_SEED=42` in script).

Override property-test parameters: **`FC_SEED`**, **`FC_RUNS`**, optional **`FC_QUICK=1`** (see `fc-config.js`). How to reproduce failures and when to add a fixed regression case: **`test/REGRESSION.md`**.

Full-text, geo, heavy **`$expr`**, **`$where`**, aggregation, collation, etc. stay **out** of the main semantic equivalence generator; opaque contracts live in **`test/contracts/opaque-operators.all-levels.test.js`**.

---

## Contributor notes

- [SPEC.md](SPEC.md) — behavior-oriented specification.  
- [docs/CANONICAL_FORM.md](docs/CANONICAL_FORM.md) — idempotency and canonical shape notes.
