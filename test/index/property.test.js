"use strict";

/**
 * Property-based 测试：随机 selector 验证 rewrite 一步幂等（主目标）与有限步推论。
 */
const assert = require("node:assert/strict");

const { fc, selectorArb } = require("../helpers/arbitraries.js");
const { rewriteQuerySelector } = require("../../dist/index.js");
const { rewriteAst } = require("../../dist/rewrite.js");
const { parseSelector } = require("../../dist/operations/parse.js");
const { compileSelector } = require("../../dist/operations/compile.js");

describe("property-based: random selectors", () => {
    it("一步幂等（主性质）：rewrite(rewrite(q)) === rewrite(q)，selectorArb(3)", function () {
        this.timeout(20000);
        fc.assert(
            fc.property(selectorArb(3), (query) => {
                const r1 = rewriteQuerySelector(query);
                const r2 = rewriteQuerySelector(r1);
                assert.deepStrictEqual(r2, r1);
            }),
            { numRuns: 100 }
        );
    });

    it("推论：rewrite³(q) === rewrite²(q)（由一步幂等直接推出）", function () {
        this.timeout(15000);
        fc.assert(
            fc.property(selectorArb(3), (query) => {
                const r1 = rewriteQuerySelector(query);
                const r2 = rewriteQuerySelector(r1);
                const r3 = rewriteQuerySelector(r2);
                assert.deepStrictEqual(r3, r2);
            }),
            { numRuns: 50 }
        );
    });

    it("闭环：compile(parse(rewrite(q))) 经 rewriteAst 后与 rewrite(q) 相同", function () {
        this.timeout(20000);
        fc.assert(
            fc.property(selectorArb(3), (query) => {
                const r1 = rewriteQuerySelector(query);
                const ast = parseSelector(r1);
                const roundTrip = compileSelector(rewriteAst(ast));
                assert.deepStrictEqual(roundTrip, r1);
            }),
            { numRuns: 80 }
        );
    });
});

