# Canonical form & idempotency

Contributor note: why **`normalizeQuery(normalizeQuery(q).query)`** should match **`normalizeQuery(q).query`** (for the same `level` and options) on supported inputs, and which historical shape issues were addressed.

## 1. Non-idempotency root causes (historical)

| Class | Symptom | Stage | Fix |
|--------|---------|--------|-----|
| A | `$nor:[{$or:[a,b]}]` vs flat `$nor:[a,b]` | simplify / parse round-trip | Flat `$nor` children in simplify; normalize shape + canonicalize unwrap single `$or` under `$nor`. |
| B | `$or` / `$nor` child order drift | canonicalize / compile | Stable sort of `$or` and `$nor` children where commutative. |
| C | Same field split across `$and` elements after flatten | simplify → compile → parse | Predicate normalization merges same-field siblings under `$and` before further passes (at `predicate`+ levels). |
| D | `$nor` kept context-pruned shape but emitted no-ctx AST | simplifyNor | Preserve context on kept children. |
| E | Sibling field context only visible after canonical `$and` order | ordering vs simplify | Bounded internal passes in the normalize pipeline until stable (implementation cap). |

## 2. Structural invariants (modeled subset)

**Logical**

- No redundant same-op nesting under `$and` / `$or` after canonicalize where rules apply.
- Single-child `$and` / `$or` folded where safe.
- Empty `$and` → true, empty `$or` → false, empty `$nor` → true.
- `$or` / `$nor` children sorted by stable structural key where commutative.

**Field**

- At `predicate` and above: modeled operators can be merged; opaque operators stay passthrough.

**`$and` ordering**

- Field nodes ordered (e.g. by field name); compound (`$and` / `$or`) nodes after fields with stable tie-break.

## 3. Exceptions / limits

- Passthrough-heavy queries: stable ordering is attempted; unknown operators are not fully covered by every test.
- Top-level keys ignored by parse are not part of the AST; normalization does not reconstruct them.
- If an internal safety cap triggers **bailout**, the implementation returns the **pre-normalization** parse result for that call (`meta.bailedOut`); idempotency claims apply when bailout does not occur.

## 4. Tests

- `test/normalize-query.test.js` and `test/index/index.test.js`: default level, shape vs predicate behavior, exports, and basic idempotency.
