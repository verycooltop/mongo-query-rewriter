"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../../dist/predicate/ir/build-field-bundle.js");
const { normalizeFieldPredicateBundle } = require("../../../dist/predicate/normalize-field-predicate-bundle.js");

describe("predicate-capabilities / nin.nin", () => {
    it("positive：多个 $nin 合并为单个 $nin（去重并并集）", () => {
        const node = fieldNode("a", [{ op: "$nin", value: [1] }, { op: "$nin", value: [2] }, { op: "$nin", value: [2] }]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});

        assert.equal(r.contradiction, false);
        assert.equal(r.changed, true);

        const ninAtoms = r.normalizedBundle.predicates.filter((p) => p.kind === "nin");
        assert.equal(ninAtoms.length, 1);
        assert.deepStrictEqual(ninAtoms[0].values, [1, 2]);
    });

    it("positive：合并结果的值顺序遵循出现顺序", () => {
        const node = fieldNode("a", [{ op: "$nin", value: [2] }, { op: "$nin", value: [1] }]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});

        const ninAtoms = r.normalizedBundle.predicates.filter((p) => p.kind === "nin");
        assert.equal(ninAtoms.length, 1);
        assert.deepStrictEqual(ninAtoms[0].values, [2, 1]);
    });
});

