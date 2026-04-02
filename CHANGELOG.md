# Changelog

All notable changes to this project will be documented in this file.

Chinese version: [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md).

## [0.2.1] - 2026-04-02

### Highlights

* Fixed `predicate`-level normalization to correctly merge multiple `$ne` constraints into a single `$nin`.
* Fixed `predicate`-level normalization to correctly merge multiple `$nin` constraints into a single `$nin` (union of values), preserving conjunction semantics.

### Changed

#### Predicate level: corrected `$ne`/`$nin` merge semantics

* Included `ne.ne` and `nin.nin` merge rules in the default predicate rewrite surface.
* Updated capability ordering so the merge rules run in the intended sequence.

### Testing

* Added unit and semantic equivalence coverage for `$ne + $ne`, `$nin + $nin`, and mixed `$ne`/`$nin` scenarios.

## [0.2.0] - 2026-04-01

### Highlights

* Refined the normalization model around conservative correctness.
* Hardened `predicate` around a smaller, explicitly supported rewrite surface.
* Reworked higher-level normalization (`scope` / logical) toward inherited constraint propagation, conservative pruning, and coverage elimination.
* Removed the unfinished experimental layer.
* Expanded contract, unit, and semantic tests for high-risk MongoDB query semantics.

### Changed

#### Predicate level: narrowed to an explicitly supported conservative rewrite surface

`predicate` is now positioned as a conservative normalizer: it rewrites only within a small set of supported, tested capabilities, and prefers preserving original predicates over aggressive assumptions.

Currently validated predicate rewrite capabilities:

* `eq.eq`
* `eq.ne`
* `eq.in`
* `eq.range`
* `range.range`

For high-risk or semantically sensitive combinations, normalization remains conservative instead of speculative. This includes cases involving null-vs-missing semantics, array-sensitive matching, `$exists`, `$nin`, whole-object vs dotted-path combinations, and opaque/unsupported operators mixed with supported predicates.

#### Scope / logical redesign

Higher-level normalization has been reworked:

* inherited constraint propagation
* conservative branch pruning
* coverage elimination
* `$or` common predicate handling reduced to observe-only by default

The design goal is stricter: do not rewrite unless correctness is sufficiently clear.

#### Removed experimental level

The unfinished experimental layer has been removed.

#### Simplified public surface

Removed unsupported or misleading preview-facing options, including unsupported safety options such as `allowNorPropagation`.

#### Impossible selector canonical form updated

Updated the canonical representation for impossible selectors. If you rely on impossible-query normalization in tests or snapshots, update expectations.

### Testing

Predicate validation is significantly stronger in this release.

Added / expanded coverage for:

* `$exists: false` combinations
* `$nin` mixed with supported predicate rewrites
* null vs missing semantics
* comparable vs non-comparable range boundaries
* whole-object vs dotted-path interactions
* opaque operator mixes such as `$regex` / `$elemMatch`
* observe/meta contract consistency
* capability whitelist enforcement
* idempotence and semantic equivalence

Release validation includes expanded unit / contract coverage and Mongo-backed semantic verification for high-risk predicate cases.

### Breaking / behavior changes

This version may change normalization output for preview levels:

* `predicate`
* `scope`

Scope-level logical processing behavior is also more conservative in this release.

These changes are intentional and reflect a stricter, more conservative normalization contract.

`shape` remains the most stable production-safe baseline and is unchanged in spirit.

### Notes for users

`predicate` should now be understood as:

* safe within its explicitly tested rewrite surface
* conservative outside that surface
* not a full MongoDB semantic optimizer

If you need maximum predictability, `shape` remains the safest baseline. If you use `predicate` or higher preview levels, review snapshots and expectations when upgrading.

---

## [0.1.0] - 2026-03-30

Initial public release of `mongo-query-normalizer`.

### Added

* Published the initial level-based normalization API:

  * `shape`
  * `predicate`
  * `scope`
  * `experimental`
* Exposed observable normalization metadata via `meta`, including change flags, rule traces, warnings, hashes, and optional stats.
* Added non-production console warnings for non-`shape` levels to reduce accidental misuse during development.

### Clarified

* `shape` is the **only recommended production level** in `v0.1.0`.
* The default behavior remains `level: "shape"`.
* `predicate`, `scope`, and `experimental` are published as **preview / experimental surfaces** for:

  * offline analysis
  * replay testing
  * semantic validation
  * targeted experiments
* Higher levels are **not recommended for general production traffic** in `v0.1.0`.
* `mongo-query-normalizer` should be understood as an **observable, shape-first normalizer** with a **conservative production default**, not a MongoDB query planner or optimizer.

### Notes

* README guidance was strengthened to make the `v0.1.0` stability boundary more explicit.
* Non-`shape` levels now add a warning to `meta.warnings`.
* Non-`shape` levels also emit a once-per-level `console.warn` in non-production environments.
* Production-readiness beyond `shape` is intentionally left out of the `v0.1.0` compatibility promise.
