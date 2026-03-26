"use strict";

/**
 * core/canonicalize.ts 单元测试
 * 目的：$and 子节点稳定排序、indexSpecs 键序优先、非 $and 节点原样返回、幂等性。
 */
const assert = require("node:assert/strict");
const { canonicalize } = require("../dist/core/index.js");
const { ASTNodeBuilder } = require("../dist/ast/index.js");

const logical = ASTNodeBuilder.logical.bind(ASTNodeBuilder);
const field = ASTNodeBuilder.field.bind(ASTNodeBuilder);
const trueNode = ASTNodeBuilder.trueNode.bind(ASTNodeBuilder);
const falseNode = ASTNodeBuilder.falseNode.bind(ASTNodeBuilder);

describe("core/canonicalize.ts", () => {
    describe("非 $and 节点", () => {
        it("FieldNode 单条件原样返回（引用可不同，结构一致）", () => {
            const ast = field("a", [{ op: "$eq", value: 5 }]);
            const out = canonicalize(ast);
            assert.strictEqual(out.type, "field");
            assert.strictEqual(out.field, "a");
            assert.deepStrictEqual(out.conditions, [{ op: "$eq", value: 5 }]);
        });

        it("Spec §11.4：FieldNode.conditions 按规范顺序排序（$eq,$gt,$gte,$lt,$lte,$in,$nin,$exists,$ne）", () => {
            const ast = field("x", [
                { op: "$ne", value: 0 },
                { op: "$gt", value: 1 },
                { op: "$eq", value: 5 },
                { op: "$lte", value: 10 },
                { op: "$exists", value: true },
            ]);
            const out = canonicalize(ast);
            assert.strictEqual(out.type, "field");
            const ops = out.conditions.map((c) => c.op);
            assert.deepStrictEqual(ops, ["$eq", "$gt", "$lte", "$exists", "$ne"]);
        });

        it("Spec §11.4：含 $in/$nin 时顺序正确", () => {
            const ast = field("k", [
                { op: "$nin", value: [0] },
                { op: "$in", value: [1, 2, 3] },
                { op: "$gte", value: 0 },
            ]);
            const out = canonicalize(ast);
            const ops = out.conditions.map((c) => c.op);
            assert.deepStrictEqual(ops, ["$gte", "$in", "$nin"]);
        });

        it("trueNode / falseNode 原样返回", () => {
            assert.deepStrictEqual(canonicalize(trueNode()), { type: "true" });
            assert.deepStrictEqual(canonicalize(falseNode()), { type: "false" });
        });

        it("$or 子节点按稳定结构键排序（析取可交换，canonical 唯一化）", () => {
            const ast = logical("$or", [
                field("z", [{ op: "$eq", value: 1 }]),
                field("a", [{ op: "$eq", value: 2 }]),
            ]);
            const out = canonicalize(ast);
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$or");
            assert.strictEqual(out.children.length, 2);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "z");
        });
    });

    describe("$and 无 indexSpecs：按字段名字母序稳定排序", () => {
        it("多字段 $and 按 field 字母序排列", () => {
            const ast = logical("$and", [
                field("z", [{ op: "$eq", value: 1 }]),
                field("a", [{ op: "$eq", value: 2 }]),
                field("m", [{ op: "$eq", value: 3 }]),
            ]);
            const out = canonicalize(ast);
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$and");
            assert.strictEqual(out.children.length, 3);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "m");
            assert.strictEqual(out.children[2].field, "z");
        });

        it("同分数字段按 tiebreak 字母序", () => {
            const ast = logical("$and", [
                field("b", [{ op: "$eq", value: 1 }]),
                field("a", [{ op: "$eq", value: 2 }]),
            ]);
            const out = canonicalize(ast);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "b");
        });

        it("logical/true/false 子节点排在 field 之后，稳定", () => {
            const ast = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }]),
                logical("$or", [
                    field("x", [{ op: "$eq", value: 0 }]),
                    field("y", [{ op: "$eq", value: 1 }]),
                ]),
                trueNode(),
            ]);
            const out = canonicalize(ast);
            assert.strictEqual(out.children.length, 3);
            assert.strictEqual(out.children[0].type, "field");
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].type, "logical");
            assert.strictEqual(out.children[2].type, "true");
        });
    });

    describe("$and 有 indexSpecs：按索引键顺序优先", () => {
        it("单索引 key 顺序决定 $and 子节点顺序", () => {
            const ast = logical("$and", [
                field("z", [{ op: "$eq", value: 1 }]),
                field("a", [{ op: "$eq", value: 2 }]),
                field("m", [{ op: "$eq", value: 3 }]),
            ]);
            const out = canonicalize(ast, [
                { key: { a: 1, z: 1, m: -1 } },
            ]);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "z");
            assert.strictEqual(out.children[2].field, "m");
        });

        it("多索引：按第一个索引键顺序，未在索引中的字段放最后", () => {
            const ast = logical("$and", [
                field("x", [{ op: "$eq", value: 1 }]),
                field("a", [{ op: "$eq", value: 2 }]),
                field("other", [{ op: "$eq", value: 3 }]),
            ]);
            const out = canonicalize(ast, [
                { key: { a: 1, x: 1 } },
                { key: { other: -1 } },
            ]);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "x");
            assert.strictEqual(out.children[2].field, "other");
        });

        it("indexSpecs 空数组视为无索引，按字母序", () => {
            const ast = logical("$and", [
                field("z", [{ op: "$eq", value: 1 }]),
                field("a", [{ op: "$eq", value: 2 }]),
            ]);
            const out = canonicalize(ast, []);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "z");
        });
    });

    describe("递归 canonicalize", () => {
        it("嵌套 $and 打平后子节点按字段排序", () => {
            const ast = logical("$and", [
                logical("$and", [
                    field("z", [{ op: "$eq", value: 1 }]),
                    field("a", [{ op: "$eq", value: 2 }]),
                ]),
            ]);
            const out = canonicalize(ast);
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$and");
            assert.strictEqual(out.children.length, 2);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "z");
        });
    });

    describe("幂等性", () => {
        it("对已排序的 $and 再 canonicalize 结果不变", () => {
            const ast = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }]),
                field("b", [{ op: "$eq", value: 2 }]),
            ]);
            const once = canonicalize(ast);
            const twice = canonicalize(once);
            assert.deepStrictEqual(once.children.map((c) => c.field), twice.children.map((c) => c.field));
        });
    });
});
