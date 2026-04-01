"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../../dist/predicate/ir/build-field-bundle.js");
const { normalizeFieldPredicateBundle } = require("../../../dist/predicate/normalize-field-predicate-bundle.js");

describe("predicate-capabilities / eq.ne", () => {
    it("contradiction：$eq 与 $ne 同值", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$ne", value: 1 },
        ]);
        const bundle = buildFieldPredicateBundleFromFieldNode(node);
        const r = normalizeFieldPredicateBundle(bundle, {});
        assert.equal(r.contradiction, true);
        assert.equal(r.contradictionCapabilityId, "eq.ne");
    });

    it("passthrough：$ne 不同值", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$ne", value: 2 },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.equal(r.contradiction, false);
    });
});
