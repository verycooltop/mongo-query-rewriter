"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../../dist/predicate/ir/build-field-bundle.js");
const { normalizeFieldPredicateBundle } = require("../../../dist/predicate/normalize-field-predicate-bundle.js");

describe("predicate-capabilities / eq.in", () => {
    it("positive：$in 列表去重", () => {
        const node = fieldNode("a", [{ op: "$in", value: [1, 1, 2] }]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.ok(r.changed);
        const inAtom = r.normalizedBundle.predicates.find((p) => p.kind === "in");
        assert.ok(inAtom);
        assert.equal(inAtom.values.length, 2);
    });

    it("contradiction：$eq 不在 $in", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$in", value: [2, 3] },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.equal(r.contradiction, true);
    });

    it("positive：多个 $in 求交集为单列表", () => {
        const node = fieldNode("a", [
            { op: "$in", value: [1, 2, 3] },
            { op: "$in", value: [2, 3, 4] },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.ok(r.changed);
        assert.equal(r.contradiction, false);
        const inAtom = r.normalizedBundle.predicates.find((p) => p.kind === "in");
        assert.ok(inAtom);
        assert.deepStrictEqual([...inAtom.values].sort((a, b) => a - b), [2, 3]);
    });
});
