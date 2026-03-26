const assert = require("node:assert/strict");

/**
 * operations/parse.ts 单元测试
 * 目的：parseSelector 与 toFieldConditions 覆盖所有 Mongo 查询写法、边界与特殊值，确保非法输入不 crash。
 */
const { parseSelector, toFieldConditions } = require("../dist/operations/parse.js");
const { describe, it } = require("node:test");

describe("parse 模块", () => {
    describe("toFieldConditions()", () => {
        it("将非操作符对象和字面量视为 $eq", () => {
            assert.deepEqual(toFieldConditions(5), [{ op: "$eq", value: 5 }]);
            assert.deepEqual(toFieldConditions(null), [{ op: "$eq", value: null }]);
            assert.deepEqual(toFieldConditions({ a: 1 }), [{ op: "$eq", value: { a: 1 } }]);
            assert.deepEqual(toFieldConditions([1, 2]), [{ op: "$eq", value: [1, 2] }]);
        });

        it("解析常见操作符并规范化结构", () => {
            assert.deepEqual(toFieldConditions({ $gt: 1, $lt: 5 }), [
                { op: "$gt", value: 1 },
                { op: "$lt", value: 5 },
            ]);

            assert.deepEqual(toFieldConditions({ $in: [1, 2] }), [{ op: "$in", value: [1, 2] }]);
            assert.deepEqual(toFieldConditions({ $in: 1 }), [{ op: "$in", value: [1] }]);
            assert.deepEqual(toFieldConditions({ $nin: 2 }), [{ op: "$nin", value: [2] }]);

            assert.deepEqual(toFieldConditions({ $exists: 0 }), [{ op: "$exists", value: false }]);
            assert.deepEqual(toFieldConditions({ $exists: "x" }), [{ op: "$exists", value: true }]);

            assert.deepEqual(toFieldConditions({ $regex: "abc" }), [{ op: "$regex", value: "abc" }]);
        });

        it("未知操作符保真保留 op（不伪装为 $eq）", () => {
            assert.deepEqual(toFieldConditions({ $foo: 1 }), [{ op: "$foo", value: 1 }]);
            assert.deepEqual(toFieldConditions({ $gt: 1, $foo: 2 }), [
                { op: "$gt", value: 1 },
                { op: "$foo", value: 2 },
            ]);
        });

        it("忽略对象内非 $ 键（无其他时回退为 $eq）", () => {
            assert.deepEqual(toFieldConditions({ a: 1, b: 2 }), [{ op: "$eq", value: { a: 1, b: 2 } }]);
            assert.deepEqual(toFieldConditions({ a: 1, $gt: 2 }), [{ op: "$gt", value: 2 }]);
        });
    });

    describe("parseSelector()", () => {
        it("空选择器或无关 $- 键时返回 true 节点", () => {
            assert.deepEqual(parseSelector({}), { type: "true" });
            assert.deepEqual(parseSelector({ $comment: "hi" }), { type: "true" });
            assert.deepEqual(parseSelector({ $text: { $search: "hi" } }), { type: "true" });
        });

        it("将单字段子句解析为字段节点", () => {
            assert.deepEqual(parseSelector({ a: 5 }), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: 5 }],
            });
        });

        it("将多个顶层子句包装为隐式 $and", () => {
            assert.deepEqual(parseSelector({ a: 1, b: 2 }), {
                type: "logical",
                op: "$and",
                children: [
                    { type: "field", field: "a", conditions: [{ op: "$eq", value: 1 }] },
                    { type: "field", field: "b", conditions: [{ op: "$eq", value: 2 }] },
                ],
            });
        });

        it("递归解析逻辑操作符", () => {
            assert.deepEqual(
                parseSelector({
                    $or: [{ a: 1 }, { b: { $gt: 2 } }],
                }),
                {
                    type: "logical",
                    op: "$or",
                    children: [
                        { type: "field", field: "a", conditions: [{ op: "$eq", value: 1 }] },
                        { type: "field", field: "b", conditions: [{ op: "$gt", value: 2 }] },
                    ],
                }
            );
        });

        it("用隐式 $and 组合逻辑与字段子句", () => {
            assert.deepEqual(
                parseSelector({
                    $or: [{ a: 1 }, { a: 2 }],
                    b: 3,
                }),
                {
                    type: "logical",
                    op: "$and",
                    children: [
                        {
                            type: "logical",
                            op: "$or",
                            children: [
                                { type: "field", field: "a", conditions: [{ op: "$eq", value: 1 }] },
                                { type: "field", field: "a", conditions: [{ op: "$eq", value: 2 }] },
                            ],
                        },
                        { type: "field", field: "b", conditions: [{ op: "$eq", value: 3 }] },
                    ],
                }
            );
        });

        it("忽略值非数组的逻辑操作符", () => {
            assert.deepEqual(parseSelector({ $and: { a: 1 } }), { type: "true" });
            assert.deepEqual(parseSelector({ $or: 123 }), { type: "true" });
        });

        it("在普通字段旁忽略 $- 前缀的非逻辑键", () => {
            assert.deepEqual(parseSelector({ $comment: "x", a: 1 }), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: 1 }],
            });
        });
    });

    describe("4.1 隐式 $and", () => {
        it("多字段解析为 $and 两个 FieldNode", () => {
            const out = parseSelector({ a: 5, b: { $gt: 10 } });
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$and");
            assert.strictEqual(out.children.length, 2);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "b");
            assert.deepStrictEqual(out.children[1].conditions, [{ op: "$gt", value: 10 }]);
        });
    });

    describe("4.2 显式 $and / $or / $nor 顶层与嵌套", () => {
        it("顶层 $and 数组解析", () => {
            const out = parseSelector({ $and: [{ a: 1 }, { b: 2 }] });
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$and");
            assert.strictEqual(out.children.length, 2);
        });
        it("嵌套 $or 内 $and", () => {
            const out = parseSelector({ $or: [{ $and: [{ a: 1 }, { b: 2 }] }] });
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$or");
            assert.strictEqual(out.children[0].type, "logical");
            assert.strictEqual(out.children[0].op, "$and");
        });
        it("$nor 解析", () => {
            const out = parseSelector({ $nor: [{ a: 1 }] });
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$nor");
            assert.strictEqual(out.children.length, 1);
        });
    });

    describe("4.3 字段数组值", () => {
        it("{ a: [1,2,3] } 解析为 $eq 数组（当前实现）", () => {
            const out = parseSelector({ a: [1, 2, 3] });
            assert.strictEqual(out.type, "field");
            assert.strictEqual(out.field, "a");
            assert.deepStrictEqual(out.conditions, [{ op: "$eq", value: [1, 2, 3] }]);
        });
    });

    describe("4.4 空数组 $and / $or / $nor", () => {
        it("$and: [] 解析为 logical 空子节点", () => {
            const out = parseSelector({ $and: [] });
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$and");
            assert.strictEqual(out.children.length, 0);
        });
        it("$or: [] 解析为 logical 空子节点", () => {
            const out = parseSelector({ $or: [] });
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$or");
            assert.strictEqual(out.children.length, 0);
        });
        it("$nor: [] 解析为 logical 空子节点", () => {
            const out = parseSelector({ $nor: [] });
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$nor");
            assert.strictEqual(out.children.length, 0);
        });
    });

    describe("4.5 非法结构不 crash", () => {
        it("$and 非数组时被忽略（仅 logical 分支不加入）", () => {
            const out = parseSelector({ $and: { a: 1 } });
            assert.strictEqual(out.type, "true");
        });
        it("$or 非数组时被忽略", () => {
            const out = parseSelector({ $or: 123 });
            assert.strictEqual(out.type, "true");
        });
    });

    describe("4.6 特殊值解析", () => {
        it("Date 解析为 $eq Date", () => {
            const d = new Date(1000);
            const out = parseSelector({ a: d });
            assert.strictEqual(out.conditions[0].op, "$eq");
            assert.strictEqual(out.conditions[0].value.getTime(), 1000);
        });
        it("ObjectId EJSON $oid 解析", () => {
            const out = parseSelector({ a: { $oid: "507f191e810c19729de860ea" } });
            assert.strictEqual(out.conditions[0].op, "$eq");
            assert.deepStrictEqual(out.conditions[0].value, { $oid: "507f191e810c19729de860ea" });
        });
        it("null 解析", () => {
            const out = parseSelector({ a: null });
            assert.deepStrictEqual(out.conditions, [{ op: "$eq", value: null }]);
        });
        it("undefined 在 toFieldConditions 中", () => {
            const conds = toFieldConditions(undefined);
            assert.deepStrictEqual(conds, [{ op: "$eq", value: undefined }]);
        });
    });

    describe("4.7 $elemMatch / $size 等", () => {
        it("$elemMatch 保真透传", () => {
            const conds = toFieldConditions({ $elemMatch: { x: 1 } });
            assert.deepStrictEqual(conds, [{ op: "$elemMatch", value: { x: 1 } }]);
        });
        it("$size 解析", () => {
            const conds = toFieldConditions({ $size: 3 });
            assert.deepStrictEqual(conds, [{ op: "$size", value: 3 }]);
        });
    });

    describe("4.8 深层嵌套", () => {
        it("10 层 $and 不栈溢出，解析得到 logical 根节点", () => {
            let query = { x: 1 };
            for (let i = 0; i < 10; i++) {
                query = { $and: [query] };
            }
            const out = parseSelector(query);
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$and");
            let node = out;
            for (let i = 0; i < 10; i++) {
                assert.strictEqual(node.type, "logical");
                assert.strictEqual(node.children.length, 1);
                node = node.children[0];
            }
            assert.strictEqual(node.type, "field");
            assert.strictEqual(node.field, "x");
        });
    });

    describe("4.9 重复字段（JS 对象只保留最后键，故仅一个 a）", () => {
        it("{ a: 5, a: { $gt: 10 } } 在 JS 中 a 仅最后值，解析出一个 FieldNode", () => {
            const out = parseSelector({ a: 5, a: { $gt: 10 } });
            assert.strictEqual(out.type, "field");
            assert.strictEqual(out.field, "a");
            assert.deepStrictEqual(out.conditions, [{ op: "$gt", value: 10 }]);
        });
    });
});

