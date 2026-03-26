# Canonical form & one-step idempotency

This note is for contributors. It records **why** `rewriteQuerySelector(rewriteQuerySelector(q))` should equal `rewriteQuerySelector(q)` on the supported generator subset, and which historical issues were fixed.

## 1. Non-idempotency root causes (historical)

| Class | Symptom | Stage | Fix |
|--------|---------|--------|-----|
| A | `$nor:[{$or:[a,b]}]` vs flat `$nor:[a,b]` | simplify / parse round-trip | Flat `$nor` children in `simplifyNor`; `normalize` + `canonicalize` unwrap single `$or` under `$nor`. |
| B | `$or` / `$nor` child order drift | canonicalize / compile | Stable sort of `$or` and `$nor` children via `stableStructuralSortKey` (commutative ops only). |
| C | Same field split across `$and` array elements after flatten | simplify → compile → parse | Second `predicateMerge` + `fieldConditionNormalize` after `simplify`; `fieldConditionNormalize` drops `others` ops already present in merged numeric bounds (duplicate `$lte` keys). |
| D | `$nor` kept context-pruned shape but emitted **no-ctx** AST | simplifyNor | `kept.push(childWithCtx)` instead of `childNoCtx`. |
| E | Sibling field context only visible **after** canonical `$and` order | simplify order vs canonicalize order | Internal **fixed-point** loop in `rewriteAst` (bounded passes) until `isDeepStrictEqual`. |

## 2. Structural invariants (supported modeled + logical subset)

**Logical**

- No redundant same-op nesting under `$and` / `$or` after `canonicalize`.
- Single-child `$and` / `$or` folded (where safe).
- Empty `$and` → true, empty `$or` → false, empty `$nor` → true (as in existing tests).
- `$nor` uses **flat** children list (no `$nor:[{$or:[…]}]` canonical form).
- `$or` and `$nor` children sorted by stable structural key (semantics unchanged: OR/NOR are commutative for document matching).

**Field**

- Modeled operators merged per `fieldConditionNormalize`; at most one BSON key per op on compile.
- Passthrough ops preserved; ordering among passthrough duplicates follows merge rules in `predicateMerge`.

**`$and` ordering**

- Field nodes ordered by `indexSpecs` when provided, else field name; logical / true / false after fields with stable tie-break.

**`rewriteAst`**

- Applies the full single pass repeatedly until stable or `REWRITE_AST_MAX_PASSES` (implementation detail; **one** `rewriteQuerySelector` call still performs the whole convergence).

## 3. Exceptions / limits

- **Passthrough-heavy** selectors: stable ordering is still attempted, but arbitrary unknown operators are not fully covered by property tests.
- **Top-level keys** ignored by parse (`$expr`, `$where`, …) are not part of the canonical AST; rewriting does not reconstruct them.
- If the fixed-point cap is hit without convergence, the last pass output is returned (should be rare on supported inputs; report a bug with a minimal query if seen).

## 4. Property tests

- `test/index/property.test.js`: **primary** — `rewrite(rewrite(q)) === rewrite(q)` on `selectorArb(3)`.
- Corollary: `rewrite³(q) === rewrite²(q)`.
