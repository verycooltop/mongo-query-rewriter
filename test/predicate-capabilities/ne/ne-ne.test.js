"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../../dist/predicate/ir/build-field-bundle.js");
const { normalizeFieldPredicateBundle } = require("../../../dist/predicate/normalize-field-predicate-bundle.js");

describe("predicate-capabilities / ne.ne", () => {
    it("positive：多个 $ne 合并为单个 $nin", () => {
        const node = fieldNode("a", [{ op: "$ne", value: 1 }, { op: "$ne", value: 2 }]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});

        assert.equal(r.contradiction, false);
        assert.equal(r.changed, true);

        const hasNe = r.normalizedBundle.predicates.some((p) => p.kind === "ne");
        assert.equal(hasNe, false);

        const ninAtom = r.normalizedBundle.predicates.find((p) => p.kind === "nin");
        assert.ok(ninAtom);
        assert.deepStrictEqual(ninAtom.values, [1, 2]);
    });

    it("positive：$ne 数量大于 2 也能合并", () => {
        const node = fieldNode("a", [{ op: "$ne", value: 1 }, { op: "$ne", value: 2 }, { op: "$ne", value: 3 }]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});

        const ninAtom = r.normalizedBundle.predicates.find((p) => p.kind === "nin");
        assert.ok(ninAtom);
        assert.deepStrictEqual(ninAtom.values, [1, 2, 3]);
    });

    it("positive：与其它谓词共存（$ne + $gt + $ne）", () => {
        const node = fieldNode("a", [
            { op: "$gt", value: 0 },
            { op: "$ne", value: 1 },
            { op: "$ne", value: 2 },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});

        const hasNe = r.normalizedBundle.predicates.some((p) => p.kind === "ne");
        assert.equal(hasNe, false);

        const hasGt = r.normalizedBundle.predicates.some((p) => p.kind === "gt");
        assert.equal(hasGt, true);

        const ninAtom = r.normalizedBundle.predicates.find((p) => p.kind === "nin");
        assert.ok(ninAtom);
        assert.deepStrictEqual(ninAtom.values, [1, 2]);
    });

    it("positive：$ne 与已存在 $nin 混合时合并为单个 $nin", () => {
        const node = fieldNode("a", [{ op: "$ne", value: 1 }, { op: "$nin", value: [2] }, { op: "$ne", value: 3 }]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});

        const hasNe = r.normalizedBundle.predicates.some((p) => p.kind === "ne");
        assert.equal(hasNe, false);

        const ninAtom = r.normalizedBundle.predicates.find((p) => p.kind === "nin");
        assert.ok(ninAtom);
        assert.deepStrictEqual(ninAtom.values, [2, 1, 3]);
    });

    it("dedupe：相同 $ne 由原子去重处理，不应生成 $nin", () => {
        const node = fieldNode("a", [{ op: "$ne", value: 1 }, { op: "$ne", value: 1 }]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});

        const ninAtom = r.normalizedBundle.predicates.find((p) => p.kind === "nin");
        assert.ok(!ninAtom);

        const neAtoms = r.normalizedBundle.predicates.filter((p) => p.kind === "ne");
        assert.equal(neAtoms.length, 1);
        assert.equal(neAtoms[0].value, 1);
    });
});

