# Normalization capability & propagation matrix

Chinese: [normalization-matrix.zh-CN.md](./normalization-matrix.zh-CN.md).

This document matches the **current** implementation (`shape` → `predicate` → `scope`). Public `NormalizeLevel` values are exactly these three names; there is **no** separate `experimental` level. It is the place to decide whether new work belongs in **predicate** (local bundle analysis only) or **scope** (inherited constraints + branch decisions).

**Boundaries**

- **Predicate:** local analysis per field bundle only; contradiction / coverage / tighten / normalize; no parent context.
- **Scope:** **inherited constraint propagation**, **conservative branch pruning**, and narrow **coverage elimination** when policy allows; collapse / preserve behavior per safety policy. No new operator-level merge logic beyond configured rewrites. Optional **`detectCommonPredicatesInOr`** is observe-only (warnings), not a structural rewrite.
- **Semantic** is **not** a separate normalization level.

Legend for predicate: **supported** (runs by default), **guarded** (needs explicit `PredicateSafetyPolicy` flag), **skipped** (planner leaves capability out with a reason), **unsupported** (not implemented as a capability).

Legend for scope: **allowed**, **allowed with guard** (policy flag), **preserve only** (no transform), **unsupported** (not implemented).

---

## 1. Predicate capability matrix

| Capability id | Status | Default on? | Notes |
|---------------|--------|-------------|--------|
| `eq.eq` | supported | yes (when merge rules on) | Dedupe / merge same-value `$eq`. |
| `eq.ne` | supported | yes | Contradiction vs same-value `$eq`. |
| `eq.in` | guarded / skipped | yes when safe | Skipped when `hasArraySensitiveSemantics` and `!allowArraySensitiveRewrite`; skipped when `hasNullSemantics` and `!allowNullSemanticRewrite`. |
| `eq.range` | supported | yes | `$eq` vs range clash. |
| `range.range` | supported | yes | Comparable range merge. |
| `in.in` | unsupported | — | Not registered in default capability set (phase governance). |
| `in.nin` | unsupported | — | Same. |
| `exists.*` | unsupported | — | Atoms exist in IR but no dedicated merge capability in default registry. |
| `null.*` | skipped via policy | — | Handled indirectly via `hasNullSemantics` gates on `eq.in` and related bailout. |

Opaque / mixed bundles: when `bailoutOnUnsupportedMix` is true (default), planner skips all capabilities with reason `unsupported opaque mix in bundle`.

---

## 2. Scope propagation matrix

| Scenario | Status | Notes |
|----------|--------|--------|
| Root → `$and` child | allowed | Sibling field constraints merged into inherited set per child (phase-1 allowlist). |
| Root → `$or` branch | allowed | Same inherited set passed to each branch when `allowOrPropagation`. |
| `$and` siblings → child | allowed | Per-child sibling merge before recurse. |
| `$or` → nested branch | allowed | Coverage strip + optional prune per branch. |
| `$nor` / `$not` | preserve only | Not modeled as safe propagation sources in phase 1; no public toggle — subtrees stay out of inherited constraint extraction. |
| Single-branch `$or` collapse | allowed with guard | `allowSingleBranchCollapse`. |
| Covered local constraint removal | allowed with guard | `allowConstraintCoverageElimination`; bails out if inherited metadata `hasUnsupportedSemantics` and `bailoutOnUnsupportedScopeMix`. |

---

## 3. ConstraintSet phase-1 contents

**Allowed in `byField` (after filtering):** `eq`, `gt`, `gte`, `lt`, `lte`, `in` on bundles that are **not** array-sensitive, null-sensitive, opaque, or path-conflict-risk.

**Rejected (recorded in `metadata.extractionRejections`, original AST preserved):** `exists`, `ne`, `nin`, `opaque`, any atom on bundles flagged unsupported at field level (opaque mix, array-sensitive, null-sensitive, dotted-path conflict risk), non-`$and` compound shapes as constraint sources.

---

## 4. Debug / meta

- **`observe.collectPredicateTraces`** → `meta.predicateTraces[]`: atom kinds, applied capability ids, planner `skippedCapabilities` with reasons, contradiction / coverage / tighten flags.
- **`observe.collectScopeTraces`** → `meta.scopeTrace`: `constraintRejections` (from ConstraintSet extraction), `events` (and-propagation, coverage-removal, prune, optional single-branch collapse).

---

## 5. `v0.2.0` note

`v0.2.0` positions predicate rewriting as a conservative, explicitly validated surface:

- validated capabilities: `eq.eq`, `eq.ne`, `eq.in`, `eq.range`, `range.range`
- high-risk combinations remain conservative (preserve-first), including null-vs-missing, array-sensitive semantics, `$exists` / `$nin`, whole-object vs dotted-path interactions, and opaque mixes
