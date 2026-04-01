"use strict";

const assert = require("node:assert/strict");
const { runAtLevel } = require("../helpers/level-runner.js");
const { commonPredicatesInOr, commonPredicatesInOrTriple } = require("../helpers/level-cases.js");

describe("scope / detectCommonPredicatesInOr（observe-only，不改写结构）", () => {
    it("公共谓词 $or：scope 与 predicate 查询同形", () => {
        const predicateQuery = runAtLevel("predicate", commonPredicatesInOr).query;
        const scopeQuery = runAtLevel("scope", commonPredicatesInOr).query;
        assert.deepStrictEqual(scopeQuery, predicateQuery);
        assert.ok(Array.isArray(scopeQuery.$or));
    });

    it("相较 predicate 可产生更多 warnings（不校验具体文案）", () => {
        const observe = { collectWarnings: true };
        const pw = runAtLevel("predicate", commonPredicatesInOr, { observe }).meta.warnings.length;
        const sw = runAtLevel("scope", commonPredicatesInOr, { observe }).meta.warnings.length;
        assert.ok(sw > pw);
    });

    it("contract：不做 $or hoist，scope 与 predicate 结构一致", () => {
        const pred = runAtLevel("predicate", commonPredicatesInOr).query;
        const scoped = runAtLevel("scope", commonPredicatesInOr).query;
        assert.deepStrictEqual(scoped, pred);
        assert.ok(Array.isArray(scoped.$or));
    });

    it("三分支公共 $or：scope 仍与 predicate 同形", () => {
        const p = runAtLevel("predicate", commonPredicatesInOrTriple).query;
        const s = runAtLevel("scope", commonPredicatesInOrTriple).query;
        assert.deepStrictEqual(s, p);
    });
});
