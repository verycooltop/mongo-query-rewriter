"use strict";

/**
 * core/normalize.ts 单元测试
 * 目的：normalize(ast) 结构等价变换——打平同 op、空逻辑→true/false、单子折叠；
 * 与 simplify 一致的空 $and/$or 语义；幂等性。
 */
const assert = require("node:assert/strict");
const { normalize } = require("../dist/core/index.js");
const { ASTNodeBuilder } = require("../dist/ast/index.js");
const { parseSelector } = require("../dist/operations/parse.js");
const { simplify } = require("../dist/core/index.js");

const logical = ASTNodeBuilder.logical.bind(ASTNodeBuilder);
const field = ASTNodeBuilder.field.bind(ASTNodeBuilder);
const trueNode = ASTNodeBuilder.trueNode.bind(ASTNodeBuilder);
const falseNode = ASTNodeBuilder.falseNode.bind(ASTNodeBuilder);

describe("core/normalize.ts", () => {
    describe("3.1 $and 扁平化", () => {
        it("嵌套 $and 打平为一层", () => {
            const ast = logical("$and", [
                logical("$and", [
                    field("a", [{ op: "$eq", value: 1 }]),
                    field("b", [{ op: "$eq", value: 2 }]),
                ]),
            ]);
            const out = normalize(ast);
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$and");
            assert.strictEqual(out.children.length, 2);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "b");
        });
    });

    describe("3.5 空 $and → trueNode，空 $or → falseNode", () => {
        it("空 $and 返回 trueNode", () => {
            const ast = logical("$and", []);
            const out = normalize(ast);
            assert.deepStrictEqual(out, { type: "true" });
        });

        it("空 $or 返回 falseNode", () => {
            const ast = logical("$or", []);
            const out = normalize(ast);
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("空 $nor 返回 trueNode（与 simplify 一致）", () => {
            const ast = logical("$nor", []);
            const out = normalize(ast);
            assert.deepStrictEqual(out, { type: "true" });
        });
    });

    describe("$nor：单子项 $or 与扁平 $nor 等价，收拢为扁平子句", () => {
        it("$nor:[$or:[a,b]] 打平为 $nor:[a,b]", () => {
            const ast = logical("$nor", [
                logical("$or", [
                    field("a", [{ op: "$eq", value: 1 }]),
                    field("b", [{ op: "$eq", value: 2 }]),
                ]),
            ]);
            const out = normalize(ast);
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$nor");
            assert.strictEqual(out.children.length, 2);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "b");
        });
    });

    describe("3.6 深度嵌套 $and/$and 完全展开", () => {
        it("三层 $and 打平为单层多子节点", () => {
            const ast = logical("$and", [
                logical("$and", [
                    logical("$and", [
                        field("x", [{ op: "$eq", value: 1 }]),
                    ]),
                ]),
            ]);
            const out = normalize(ast);
            assert.deepStrictEqual(out, {
                type: "field",
                field: "x",
                conditions: [{ op: "$eq", value: 1 }],
            });
        });
    });

    describe("单子节点折叠", () => {
        it("$and 仅一个子节点时折叠为该子节点", () => {
            const ast = logical("$and", [field("a", [{ op: "$eq", value: 1 }])]);
            const out = normalize(ast);
            assert.deepStrictEqual(out, {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: 1 }],
            });
        });

        it("$or 仅一个子节点时折叠为该子节点", () => {
            const ast = logical("$or", [field("a", [{ op: "$eq", value: 1 }])]);
            const out = normalize(ast);
            assert.deepStrictEqual(out, {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: 1 }],
            });
        });
    });

    describe("非 logical 节点原样返回", () => {
        it("FieldNode 原样返回", () => {
            const ast = field("a", [{ op: "$eq", value: 5 }]);
            const out = normalize(ast);
            assert.deepStrictEqual(out, ast);
        });

        it("trueNode / falseNode 原样返回", () => {
            assert.deepStrictEqual(normalize(trueNode()), { type: "true" });
            assert.deepStrictEqual(normalize(falseNode()), { type: "false" });
        });
    });

    describe("3.9 normalize(simplify(parse(query))) 幂等性", () => {
        it("对已简化的 AST 再 normalize 结果稳定", () => {
            const query = { a: 5, b: { $gt: 10 } };
            const ast = simplify(parseSelector(query));
            const once = normalize(ast);
            const twice = normalize(once);
            assert.deepStrictEqual(once, twice);
        });
    });
});
