"use strict";

const assert = require("node:assert/strict");
const fc = require("fast-check");
const { normalizeQuery } = require("../../dist/index.js");
const { IMPOSSIBLE_SELECTOR } = require("../../dist/types.js");
const { getFcAssertOptions } = require("../helpers/fc-config.js");

function assertIdempotentAtPredicate(query) {
    const once = normalizeQuery(query, { level: "predicate" });
    const twice = normalizeQuery(once.query, { level: "predicate" });
    assert.deepStrictEqual(twice.query, once.query, `idempotence failed for ${JSON.stringify(query)}`);
}

describe("predicate convergence / same-field bundle closure", () => {
    it("eq × in：矛盾单轮为 IMPOSSIBLE_SELECTOR", () => {
        const q = { $and: [{ a: { $eq: 1 } }, { a: { $in: [2, 3] } }] };
        const { query } = normalizeQuery(q, { level: "predicate" });
        assert.deepStrictEqual(query, IMPOSSIBLE_SELECTOR);
        assertIdempotentAtPredicate(q);
    });

    it("eq × in：兼容时去掉冗余 $in，单轮为字面量 $eq", () => {
        const q = { $and: [{ a: { $eq: 2 } }, { a: { $in: [1, 2, 3] } }] };
        const { query } = normalizeQuery(q, { level: "predicate" });
        assert.deepStrictEqual(query, { a: 2 });
        assertIdempotentAtPredicate(q);
    });

    it("eq × bounds：兼容时去掉冗余 range", () => {
        const q = { $and: [{ a: { $eq: 5 } }, { a: { $gt: 1 } }, { a: { $lte: 9 } }] };
        const { query } = normalizeQuery(q, { level: "predicate" });
        assert.deepStrictEqual(query, { a: 5 });
        assertIdempotentAtPredicate(q);
    });

    it("eq × bounds：矛盾为 IMPOSSIBLE_SELECTOR", () => {
        const q = { $and: [{ a: { $eq: 1 } }, { a: { $gt: 5 } }] };
        assert.deepStrictEqual(normalizeQuery(q, { level: "predicate" }).query, IMPOSSIBLE_SELECTOR);
    });

    it("in × bounds：空交集为 IMPOSSIBLE_SELECTOR", () => {
        const q = { $and: [{ a: { $in: [1, 2] } }, { a: { $gt: 5 } }] };
        assert.deepStrictEqual(normalizeQuery(q, { level: "predicate" }).query, IMPOSSIBLE_SELECTOR);
    });

    it("in × bounds：收紧 $in 并去掉被蕴含的 range", () => {
        const q = { $and: [{ a: { $in: [1, 6, 7] } }, { a: { $gt: 5 } }] };
        assert.deepStrictEqual(normalizeQuery(q, { level: "predicate" }).query, { a: { $in: [6, 7] } });
        assertIdempotentAtPredicate(q);
    });

    it("bounds × bounds：矛盾为 IMPOSSIBLE_SELECTOR", () => {
        const q = { $and: [{ a: { $gt: 5 } }, { a: { $lt: 3 } }] };
        assert.deepStrictEqual(normalizeQuery(q, { level: "predicate" }).query, IMPOSSIBLE_SELECTOR);
    });

    it("混合：$in 交集 × $gt", () => {
        const q = { $and: [{ a: { $in: [1, 2, 3] } }, { a: { $in: [2, 3, 4] } }, { a: { $gt: 2 } }] };
        assert.deepStrictEqual(normalizeQuery(q, { level: "predicate" }).query, { a: { $in: [3] } });
        assertIdempotentAtPredicate(q);
    });

    it("property：$and 子句在单字段 a 上由 eq / in / bounds 组成时，predicate 层 normalize 幂等", () => {
        const v = fc.integer({ min: 0, max: 8 });
        const inList = fc.uniqueArray(v, { minLength: 1, maxLength: 4 });
        const clause = fc.oneof(
            v.map((x) => ({ a: { $eq: x } })),
            v.map((x) => ({ a: x })),
            inList.map((arr) => ({ a: { $in: arr } })),
            v.map((x) => ({ a: { $gt: x } })),
            v.map((x) => ({ a: { $gte: x } })),
            v.map((x) => ({ a: { $lt: x } })),
            v.map((x) => ({ a: { $lte: x } }))
        );
        const queryArb = fc
            .array(clause, { minLength: 1, maxLength: 4 })
            .map((parts) => (parts.length === 1 ? parts[0] : { $and: parts }));

        fc.assert(
            fc.property(queryArb, (query) => {
                assertIdempotentAtPredicate(query);
            }),
            getFcAssertOptions({ numRuns: 80 })
        );
    });
});
