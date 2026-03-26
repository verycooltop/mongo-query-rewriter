"use strict";

/**
 * 入口 index 与端到端：rewriteQuerySelector 从 index 导出，parse→simplify→normalize→compile 全链路一致。
 */
const assert = require("node:assert/strict");
const { rewriteQuerySelector, IMPOSSIBLE_SELECTOR } = require("../../dist/index.js");
const { rewriteAst } = require("../../dist/rewrite.js");
const { parseSelector } = require("../../dist/operations/parse.js");
const { compileSelector } = require("../../dist/operations/compile.js");

describe("index + 端到端", () => {
    it("index 导出 rewriteQuerySelector", () => {
        assert.strictEqual(typeof rewriteQuerySelector, "function");
    });

    it("index 导出 IMPOSSIBLE_SELECTOR（Spec §2.2）", () => {
        assert.ok(IMPOSSIBLE_SELECTOR && IMPOSSIBLE_SELECTOR._id && IMPOSSIBLE_SELECTOR._id.$exists === false);
    });

    it("端到端：parse → rewriteAst → compile 与 rewriteQuerySelector 一致", () => {
        const query = { a: 5, b: { $gt: 10 } };
        const ast = parseSelector(query);
        const compiled = compileSelector(rewriteAst(ast));
        const rewritten = rewriteQuerySelector(query);
        assert.deepStrictEqual(compiled, rewritten);
    });

    it("端到端：空查询", () => {
        const out = rewriteQuerySelector({});
        assert.deepStrictEqual(out, {});
    });

    it("端到端：冲突查询返回不可满足", () => {
        const out = rewriteQuerySelector({ $and: [{ a: 1 }, { a: 2 }] });
        assert.deepStrictEqual(out._id, { $exists: false });
    });
});

