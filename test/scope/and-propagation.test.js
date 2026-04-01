"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");
const { IMPOSSIBLE_SELECTOR } = require("../../dist/types.js");

describe("scope / and-propagation", () => {
    const q = { $and: [{ a: 1 }, { $or: [{ a: 1 }, { b: 1 }] }] };

    it("兄弟字段约束传播后，$or 内冗余分支可消去并折叠", () => {
        const { query } = normalizeQuery(q, { level: "scope" });
        assert.deepStrictEqual(query, { a: 1 });
    });

    it("predicate 层保留 $and/$or；scope 在继承约束下收紧", () => {
        const pred = normalizeQuery(q, { level: "predicate" }).query;
        const scoped = normalizeQuery(q, { level: "scope" }).query;
        assert.ok(pred.$and);
        assert.ok(pred.$and[1].$or);
        assert.deepStrictEqual(scoped, { a: 1 });
    });
});
