"use strict";

/**
 * operations/compile.ts 单元测试
 * 目的：compileSelector(ast) 输出 Mongo Query 对象；FieldNode/$and/$or/$nor、true/false、特殊值、端到端一致。
 */
const assert = require("node:assert/strict");
const { compileSelector } = require("../dist/operations/compile.js");
const { ASTNodeBuilder } = require("../dist/ast/index.js");
const { parseSelector } = require("../dist/operations/parse.js");
const { normalize } = require("../dist/core/index.js");
const { simplify } = require("../dist/core/index.js");
const { makeObjectIdLike } = require("./helpers/assertions.js");

const logical = ASTNodeBuilder.logical.bind(ASTNodeBuilder);
const field = ASTNodeBuilder.field.bind(ASTNodeBuilder);
const trueNode = ASTNodeBuilder.trueNode.bind(ASTNodeBuilder);
const falseNode = ASTNodeBuilder.falseNode.bind(ASTNodeBuilder);

describe("operations/compile.ts", () => {
    describe("5.1 FieldNode → field 与 $op 或简写", () => {
        it("单条件 $eq 编译为简写 { field: value }", () => {
            const ast = field("a", [{ op: "$eq", value: 5 }]);
            const out = compileSelector(ast);
            assert.deepStrictEqual(out, { a: 5 });
        });

        it("$gt 编译为 { field: { $op: value } }", () => {
            const ast = field("a", [{ op: "$gt", value: 10 }]);
            const out = compileSelector(ast);
            assert.deepStrictEqual(out, { a: { $gt: 10 } });
        });
    });

    describe("5.2 $and / $or / $nor 正确转回数组", () => {
        it("$and 多子节点编译为 $and 数组", () => {
            const ast = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }]),
                field("b", [{ op: "$eq", value: 2 }]),
            ]);
            const out = compileSelector(ast);
            assert.ok(Array.isArray(out.$and));
            assert.strictEqual(out.$and.length, 2);
        });

        it("$or 编译为数组", () => {
            const ast = logical("$or", [
                field("a", [{ op: "$eq", value: 1 }]),
                field("b", [{ op: "$eq", value: 2 }]),
            ]);
            const out = compileSelector(ast);
            assert.ok(Array.isArray(out.$or));
            assert.strictEqual(out.$or.length, 2);
        });

        it("$nor 编译为数组", () => {
            const ast = logical("$nor", [field("a", [{ op: "$eq", value: 1 }])]);
            const out = compileSelector(ast);
            assert.ok(Array.isArray(out.$nor));
        });
    });

    describe("5.3 空 conditions 的 FieldNode", () => {
        it("空 conditions 编译为 undefined 或省略", () => {
            const ast = field("a", []);
            const out = compileSelector(ast);
            assert.deepStrictEqual(out, { a: undefined }, "整表仅含该字段且值为 undefined");
        });
    });

    describe("5.4 trueNode / falseNode", () => {
        it("trueNode → {}", () => {
            const out = compileSelector(trueNode());
            assert.deepStrictEqual(out, {});
        });

        it("falseNode → 不可满足条件（形态唯一，整表严格等于 IMPOSSIBLE）", () => {
            const out = compileSelector(falseNode());
            assert.deepStrictEqual(out, { _id: { $exists: false } });
        });
    });

    describe("5.5 收紧后的 $in / bounds / $nin 编译正确", () => {
        it("$in 编译", () => {
            const ast = field("a", [{ op: "$in", value: [1, 2] }]);
            const out = compileSelector(ast);
            assert.deepStrictEqual(out, { a: { $in: [1, 2] } });
        });

        it("多条件 bounds 编译", () => {
            const ast = field("a", [
                { op: "$gt", value: 5 },
                { op: "$lt", value: 10 },
            ]);
            const out = compileSelector(ast);
            assert.strictEqual(out.a.$gt, 5);
            assert.strictEqual(out.a.$lt, 10);
        });
    });

    describe("5.6 ObjectId / Date 序列化", () => {
        it("Date 原样保留", () => {
            const d = new Date(1000);
            const ast = field("a", [{ op: "$eq", value: d }]);
            const out = compileSelector(ast);
            assert.strictEqual(out.a.getTime(), 1000);
        });

        it("ObjectId-like 原样保留", () => {
            const oid = makeObjectIdLike("507f191e810c19729de860ea");
            const ast = field("a", [{ op: "$eq", value: oid }]);
            const out = compileSelector(ast);
            assert.strictEqual(out.a.toHexString(), "507f191e810c19729de860ea");
        });
    });

    describe("5.7 compile(normalize(simplify(parse(query)))) 端到端一致", () => {
        it("简单查询往返一致", () => {
            const query = { a: 5 };
            const ast = simplify(parseSelector(query));
            const normalized = normalize(ast);
            const compiled = compileSelector(normalized);
            assert.deepStrictEqual(compiled, { a: 5 });
        });

        it("范围查询往返", () => {
            const query = { a: { $gt: 5, $lt: 10 } };
            const ast = simplify(parseSelector(query));
            const normalized = normalize(ast);
            const compiled = compileSelector(normalized);
            assert.strictEqual(compiled.a.$gt, 5);
            assert.strictEqual(compiled.a.$lt, 10);
        });
    });

    describe("5.8 unsupported ops 原样保留", () => {
        it("$regex 编译到输出", () => {
            const ast = field("a", [{ op: "$regex", value: "x" }]);
            const out = compileSelector(ast);
            assert.strictEqual(out.a.$regex, "x");
        });
    });

    describe("5.9 compileFieldConditions 不变量", () => {
        it("同一 op 重复时抛出（避免静默覆盖）", () => {
            const ast = field("a", [
                { op: "$gt", value: 1 },
                { op: "$gt", value: 2 },
            ]);
            assert.throws(() => compileSelector(ast), /duplicate operator/);
        });
    });
});
