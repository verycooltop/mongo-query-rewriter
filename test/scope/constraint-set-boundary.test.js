"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../dist/ast/builders.js");
const { constraintSetFromFieldNode } = require("../../dist/scope/context/build-inherited-constraints.js");

describe("scope / constraint-set boundary（phase-1 inherited allowlist）", () => {
    it("$exists 不进入 byField，并记录 rejection", () => {
        const set = constraintSetFromFieldNode(fieldNode("x", [{ op: "$exists", value: true }]));
        assert.equal(set.byField.size, 0);
        assert.ok(
            set.metadata.extractionRejections.some((r) => r.atomKind === "exists" && r.fieldPath === "x")
        );
    });

    it("null 语义字段整段不继承", () => {
        const set = constraintSetFromFieldNode(fieldNode("x", [{ op: "$eq", value: null }]));
        assert.equal(set.byField.size, 0);
        assert.ok(set.metadata.hasUnsupportedSemantics);
        assert.ok(
            set.metadata.extractionRejections.some((r) => r.reason.includes("null-sensitive"))
        );
    });

    it("array-sensitive $in 整段不继承", () => {
        const set = constraintSetFromFieldNode(
            fieldNode("x", [{ op: "$in", value: [[1, 2]] }])
        );
        assert.equal(set.byField.size, 0);
        assert.ok(set.metadata.hasUnsupportedSemantics);
        assert.ok(
            set.metadata.extractionRejections.some((r) => r.reason.includes("array-sensitive"))
        );
    });

    it("$nin 不进入 byField（整段按 array-sensitive 拒绝）", () => {
        const set = constraintSetFromFieldNode(fieldNode("x", [{ op: "$nin", value: [1, 2] }]));
        assert.equal(set.byField.size, 0);
        assert.ok(set.metadata.hasUnsupportedSemantics);
        assert.ok(
            set.metadata.extractionRejections.some(
                (r) => r.atomKind === "nin" || r.reason.includes("array-sensitive")
            )
        );
    });

    it("opaque 字段谓词整段不继承", () => {
        const set = constraintSetFromFieldNode(
            fieldNode("x", [{ op: "$regex", value: "a", opaque: true }])
        );
        assert.equal(set.byField.size, 0);
        assert.ok(set.metadata.hasUnsupportedSemantics);
    });

    it("纯 $eq 仍进入 byField", () => {
        const set = constraintSetFromFieldNode(fieldNode("x", [{ op: "$eq", value: 1 }]));
        assert.equal(set.byField.get("x")?.length, 1);
        assert.equal(set.metadata.extractionRejections.length, 0);
    });
});
