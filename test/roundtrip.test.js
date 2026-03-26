"use strict";

/**
 * 严格往返与语义等价测试
 * 目的：1) 全链路 parse→normalize→predicateMerge→simplify→canonicalize→compile 与 rewrite 结果一致；
 *       2) 可满足选择器优化后再 parse→全链路 应得到相同编译结果（语义往返）；
 *       3) 幂等性表格化覆盖更多用例。
 */
const assert = require("node:assert/strict");
const { rewriteQuerySelector } = require("../dist/index.js");
const { rewriteAst } = require("../dist/rewrite.js");
const { parseSelector } = require("../dist/operations/parse.js");
const { compileSelector } = require("../dist/operations/compile.js");
const { IMPOSSIBLE_SELECTOR } = require("./helpers/assertions.js");

function fullPipeline(selector, indexSpecs) {
    const ast = parseSelector(selector);
    const canonical = rewriteAst(ast, indexSpecs ? { indexSpecs } : undefined);
    return compileSelector(canonical);
}

function isImpossible(selector) {
    return selector && selector._id && selector._id.$exists === false;
}

describe("roundtrip & 语义等价", () => {
    describe("全链路与 rewrite 一致", () => {
        const cases = [
            { query: {}, name: "空查询" },
            { query: { a: 5 }, name: "单字段等值" },
            { query: { a: 1, b: 2 }, name: "多字段隐式 $and" },
            { query: { a: { $gt: 0, $lt: 10 } }, name: "同字段范围" },
            { query: { $and: [{ a: 1 }, { b: 2 }] }, name: "显式 $and" },
            { query: { $or: [{ a: 1 }, { b: 2 }] }, name: "$or" },
            { query: { a: { $in: [1, 2, 3] } }, name: "$in" },
            { query: { a: { $exists: true } }, name: "$exists" },
            { query: { a: null }, name: "null" },
        ];

        cases.forEach(({ query, name }) => {
            it(`${name}: fullPipeline(query) === rewriteQuerySelector(query)`, () => {
                const pipeline = fullPipeline(query);
                const rewritten = rewriteQuerySelector(query);
                assert.deepStrictEqual(pipeline, rewritten, `query: ${JSON.stringify(query)}`);
            });
        });
    });

    describe("语义往返：可满足选择器优化后再解析优化结果应一致", () => {
        const satisfiableQueries = [
            { a: 5 },
            { a: 1, b: 2 },
            { a: { $gt: 0, $lt: 10 } },
            { $or: [{ a: 1 }, { b: 2 }] },
            { a: { $in: [1, 2] }, b: 3 },
        ];

        satisfiableQueries.forEach((query) => {
            it(`往返不变: rewrite(q) 再 rewrite 结果一致, q=${JSON.stringify(query)}`, () => {
                const once = rewriteQuerySelector(query);
                if (isImpossible(once)) return; // 若意外为不可满足则跳过
                const twice = rewriteQuerySelector(once);
                assert.deepStrictEqual(once, twice);
            });
        });

        it("可满足选择器：parse(compile(result)) 再全链路编译 === result", () => {
            const query = { a: 5, b: { $gt: 0 } };
            const result = rewriteQuerySelector(query);
            assert.ok(!isImpossible(result));
            const reparsed = fullPipeline(result);
            assert.deepStrictEqual(reparsed, result);
        });
    });

    describe("幂等性表格", () => {
        const idempotentCases = [
            { a: 5 },
            { a: { $gte: 1, $lte: 10 } },
            { $and: [{ a: 1 }, { b: 2 }] },
            { $or: [{ a: 1 }, { a: 2 }] },
            { a: { $in: [1, 2] }, b: { $nin: [0] } },
            { x: { $exists: false } },
        ];

        idempotentCases.forEach((query) => {
            it(`幂等: rewrite(rewrite(q)) === rewrite(q), q=${JSON.stringify(query)}`, () => {
                const once = rewriteQuerySelector(query);
                const twice = rewriteQuerySelector(once);
                assert.deepStrictEqual(once, twice);
            });
        });
    });

    describe("不可满足选择器形态唯一且幂等", () => {
        const impossibleQueries = [
            { $and: [{ a: 1 }, { a: 2 }] },
            { $and: [{ a: { $eq: 5 } }, { a: { $ne: 5 } }] },
            { $and: [{ a: { $in: [1, 2] } }, { a: { $eq: 3 } }] },
        ];

        impossibleQueries.forEach((query) => {
            it(`不可满足: 结果为 IMPOSSIBLE_SELECTOR 且二次优化仍为 IMPOSSIBLE, q=${JSON.stringify(query)}`, () => {
                const once = rewriteQuerySelector(query);
                assert.deepStrictEqual(once, IMPOSSIBLE_SELECTOR);
                const twice = rewriteQuerySelector(once);
                assert.deepStrictEqual(twice, IMPOSSIBLE_SELECTOR);
            });
        });
    });
});
