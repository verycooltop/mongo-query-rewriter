# Mongo Query Normalizer — Specification

Formal, behavior-oriented specification for **`mongo-query-normalizer`**: rule-driven, testable, and scoped to a **normalizer** (not a planner optimizer).

---

## 1. Purpose

1. Parse a MongoDB **query object** into an internal **AST**.
2. Apply **level-gated** normalization passes that default to **minimal risk**.
3. Compile back to a plain query object and attach **observable metadata**.

Semantic goal for modeled operators (see §7): for satisfiable queries,

```
match(query, doc) == match(normalized(query), doc)
```

When the engine proves **unsatisfiability** under modeled rules (at `predicate`+ levels), compilation may yield:

```
normalized(query) = IMPOSSIBLE_SELECTOR
```

Current `IMPOSSIBLE_SELECTOR` shape (implementation): `{ _id: { $exists: false } }` (canonical unsatisfiable filter for normal collections).

---

## 2. Public surface

The supported public API is **`normalizeQuery`**, **`resolveNormalizeOptions`**, and the exported **types** from the package entry. Internal modules (AST, parse, compile, rules, passes) are **not** semver-stable.

**Default:** `resolveNormalizeOptions()` sets `level: "shape"`.

---

## 3. Pipeline (fixed order)

For one `normalizeQuery` call:

```
parseQuery
→ (outer rounds) stabilize: normalizeShape / normalizePredicate+simplify / normalizeScope+simplify / canonicalize
→ compileQuery → parseQuery  (one internal BSON resync so AST matches compiled field grouping; then one more stabilize pass)
→ detectCommonPredicatesInOr (scope only, optional; observe-only — warnings / traces, no structural rewrite)
→ canonicalize
→ compileQuery
```

Inner stabilization uses bounded rounds with optional `meta.warnings` when a phase fails to converge within its round limit.

---

## 4. Bailout

If a **safety** check fails (depth, node growth, etc.), the implementation sets `meta.bailedOut` and **does not** use partially normalized AST for output:

- **`afterNode` for compile reverts to `beforeNode`** (the parse result for that invocation).

Thus callers can rely on: bailout ⇒ output query matches **parse-then-compile of the original** for that pass (modulo compile-only details), not a half-applied normalization.

---

## 5. AST model (summary)

- `LogicalNode` — `op`: `$and` | `$or`, `children[]`
- `FieldNode` — `field`, `predicates[]`
- `TrueNode` / `FalseNode`
- `OpaqueNode` — raw passthrough fragment

(Exact fields are implementation details; behavior is constrained by this spec and tests.)

---

## 6. Levels and rules

### 6.1 `shape` (default)

Structural normalization only (flatten / empty removal / single-child collapse / dedupe children / ordering as configured). **No** predicate merge, **no** contradiction collapse to `FalseNode`.

### 6.2 `predicate`

All `shape` rules plus predicate-oriented rules: dedupe same-field predicates, merge comparable predicates where modeled, collapse contradictions.

**Special case:** In `normalizePredicate`, direct sibling `FieldNode`s with the **same field name** under `$and` may be **merged** before further predicate normalization, so contradictions such as `{ $and: [{ a: 1 }, { a: 2 }] }` can be detected.

### 6.3 `scope`

`predicate` plus **scope normalization**, whose primary mechanisms are:

1. **Inherited constraint propagation** — phase-1 allowlisted field constraints from ancestors and `$and` siblings are merged into a per-child `ConstraintSet` when policy allows.
2. **Conservative branch pruning** — under `allowBranchPruning` and satisfiability analysis against inherited constraints, impossible `$or` branches may compile to the impossible filter; disabled policy preserves branches.
3. **Coverage elimination** — when `allowConstraintCoverageElimination` holds and inherited metadata is clean, redundant local constraints implied by inherited bounds may be removed (narrow, implementation-tested cases only).

**Optional, observe-only:** `rules.detectCommonPredicatesInOr` enables **detection** of common predicates inside `$or` (warnings / optional traces). It is **not** part of the core scope propagation story and **does not** hoist or rewrite query structure.

### 6.4 Scope layer contract (conservative bounds)

- **Inherited allowlist:** Only constraints extracted under the phase-1 rules participate. Typically includes comparable range atoms and `$eq` / `$in` on bundles that are not opaque, array-sensitive, null-sensitive, or path-conflict flagged. Everything else is **rejected for extraction** (recorded in scope meta when tracing) and the subtree is **preserved** in the AST.
- **Field bundle rejection:** `exists`, `$ne`, `$nin`, opaque fragments, and unsupported compound shapes as sources do not populate inherited sets; sibling merges skip non-extractable parts without widening semantics.
- **Unsupported inherited metadata:** When `hasUnsupportedSemantics` is set on the merged inherited set, **coverage elimination is skipped** for that site. With `bailoutOnUnsupportedScopeMix`, the implementation may **bail out** rather than apply risky scope rewrites (see §4).
- **Coverage elimination:** Supported only in **verified narrow cases** (e.g. identical inherited equality covering a redundant local equality on the same field). It does **not** claim general redundancy removal across arbitrary operators.
- **Branch pruning:** Runs only when branch satisfiability is analyzed as **unsatisfiable** against inherited constraints under the same conservative model; policy off ⇒ **no** pruning. Pruning does not add new predicate merges beyond `predicate` level.

---

## 7. Modeled vs opaque operators

**Modeled** (for merge / contradiction paths): at minimum `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists` where implemented.

**Opaque / limited support** (passthrough or partial handling; no full semantic rewrite): notably **`$nor`**, **`$regex`**, **`$elemMatch`**, **`$expr`**, **`$not`**, geo/text, and unknown `$` operators.

---

## 8. Compile strategy

- `TrueNode` → `{}`
- `FalseNode` → `IMPOSSIBLE_SELECTOR`
- `OpaqueNode` → raw passthrough per implementation
- `FieldNode` / `LogicalNode` → BSON-shaped query object

---

## 9. Non-goals

- Not a MongoDB **planner** or index optimizer.  
- Not full coverage of every MongoDB operator.  
- Not structural hoisting of common `$or` predicates (detection-only at `scope`).

---

## 10. Invariants (when no bailout)

- **Semantic preservation** for modeled operators on satisfiable queries (see §1).  
- **Idempotency:** `normalizeQuery(normalizeQuery(q, opts).query, opts)` should match `normalizeQuery(q, opts)` on supported inputs.  
- **Input immutability:** the library must not mutate the caller’s input object.  

---

## 11. Testing

Tests should cover: default `shape` level, explicit `predicate` / `scope` behavior (including supported vs opaque preservation), `meta` fields, bailout fallback, and idempotency. Differential tests against a real MongoDB deployment are optional but valuable for regression suites. Semantic suites may use a local `mongod` via `MONGODB_BINARY`, `MONGOD_BINARY`, or `MONGOMS_SYSTEM_BINARY` to avoid downloading a binary.
