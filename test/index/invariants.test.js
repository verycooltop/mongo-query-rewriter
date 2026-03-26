"use strict";

/**
 * Spec §13 不变量测试
 * - §13.2 Idempotency：rewrite(rewrite(q)) === rewrite(q)
 * - §13.4 Structural Safety：优化不得 mutate input query
 */
const assert = require("node:assert/strict");
const { rewriteQuerySelector } = require("../../dist/index.js");

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

describe("Spec §13 Invariants", () => {
    describe("§13.2 Idempotency", () => {
        const idempotentQueries = [
            {},
            { a: 5 },
            { a: 1, b: 2 },
            { a: { $gt: 0, $lt: 10 } },
            { $and: [{ a: 1 }, { b: 2 }] },
            { $or: [{ a: 1 }, { a: 2 }] },
            { a: { $in: [1, 2] }, b: { $nin: [0] } },
            { x: { $exists: false } },
            { $and: [{ a: { $gte: 1 } }, { a: { $lte: 10 } }] },
            { $nor: [{ a: 1 }, { b: 2 }] },
            {
                $and: [
                    { $nor: [{ $or: [{ a: { $eq: false } }, { b: { $eq: null } }] }, { b: false }] },
                    { b: "" },
                    { $or: [{ $nor: [{ a: false }] }, { a: 0 }] },
                ],
            },
        ];

        idempotentQueries.forEach((query) => {
            it(`rewrite(rewrite(q)) === rewrite(q), q=${JSON.stringify(query)}`, () => {
                const once = rewriteQuerySelector(query);
                const twice = rewriteQuerySelector(once);
                assert.deepStrictEqual(once, twice);
            });
        });
    });

    describe("§13.4 Structural Safety（不篡改输入）", () => {
        it("优化后入参对象未被修改（空对象）", () => {
            const input = {};
            const snapshot = deepClone(input);
            rewriteQuerySelector(input);
            assert.deepStrictEqual(input, snapshot);
        });

        it("优化后入参对象未被修改（单字段）", () => {
            const input = { a: 5 };
            const snapshot = deepClone(input);
            rewriteQuerySelector(input);
            assert.deepStrictEqual(input, snapshot);
        });

        it("优化后入参对象未被修改（多字段 + $and）", () => {
            const input = { $and: [{ a: 1 }, { b: 2 }] };
            const snapshot = deepClone(input);
            rewriteQuerySelector(input);
            assert.deepStrictEqual(input, snapshot);
        });

        it("优化后入参对象未被修改（嵌套 + 范围）", () => {
            const input = { a: { $gt: 0, $lt: 10 }, b: { $in: [1, 2, 3] } };
            const snapshot = deepClone(input);
            rewriteQuerySelector(input);
            assert.deepStrictEqual(input, snapshot);
        });

        it("传入 indexSpecs 时入参与 options 均未被修改", () => {
            const input = { a: 1, b: 2 };
            const indexSpecs = [{ key: { a: 1, b: 1 } }];
            const inputSnapshot = deepClone(input);
            const optionsSnapshot = deepClone(indexSpecs);
            rewriteQuerySelector(input, { indexSpecs });
            assert.deepStrictEqual(input, inputSnapshot);
            assert.deepStrictEqual(indexSpecs, optionsSnapshot);
        });
    });
});

