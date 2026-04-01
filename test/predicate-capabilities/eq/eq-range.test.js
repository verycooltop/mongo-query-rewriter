"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../../dist/predicate/ir/build-field-bundle.js");
const { normalizeFieldPredicateBundle } = require("../../../dist/predicate/normalize-field-predicate-bundle.js");

describe("predicate-capabilities / eq.range", () => {
    it("contradiction：$eq 与 $gt 冲突", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$gt", value: 2 },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.equal(r.contradiction, true);
    });
});
