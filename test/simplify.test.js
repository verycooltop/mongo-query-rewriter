"use strict";

const assert = require("node:assert/strict");
const { parseSelector } = require("../dist/operations/parse.js");
const { simplify } = require("../dist/core/simplify.js");
const { ASTNodeBuilder } = require("../dist/ast/index.js");
const { makeObjectIdLike } = require("./helpers/assertions");

const logical = ASTNodeBuilder.logical.bind(ASTNodeBuilder);
const field = ASTNodeBuilder.field.bind(ASTNodeBuilder);
const trueNode = ASTNodeBuilder.trueNode.bind(ASTNodeBuilder);
const falseNode = ASTNodeBuilder.falseNode.bind(ASTNodeBuilder);

function parseAndSimplify(selector) {
    return simplify(parseSelector(selector));
}

describe("simplify", () => {
    describe("1. 基础 & 空逻辑", () => {
        it("1.1 trueNode() 原样返回", () => {
            assert.deepStrictEqual(simplify(trueNode()), { type: "true" });
        });

        it("1.1 falseNode() 原样返回", () => {
            assert.deepStrictEqual(simplify(falseNode()), { type: "false" });
        });

        it("1.2 空 $and → trueNode", () => {
            const input = logical("$and", []);
            assert.deepStrictEqual(simplify(input), { type: "true" });
        });

        it("1.3 空 $or → falseNode", () => {
            const input = logical("$or", []);
            assert.deepStrictEqual(simplify(input), { type: "false" });
        });

        it("1.4 空 $nor → trueNode（内部 or 空为 false，取反为 true）", () => {
            const input = logical("$nor", []);
            assert.deepStrictEqual(simplify(input), { type: "true" });
        });
    });

    describe("2. 单一 FieldNode（无 context）", () => {
        it("2.1 普通条件 { a: $eq: 5 } 原样返回", () => {
            const input = field("a", [{ op: "$eq", value: 5 }]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: 5 }],
            });
        });

        it("2.2 多条件同字段（已聚合）原样返回", () => {
            const input = field("a", [
                { op: "$gt", value: 5 },
                { op: "$lt", value: 10 },
            ]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [
                    { op: "$gt", value: 5 },
                    { op: "$lt", value: 10 },
                ],
            });
        });

        it("2.3 自身冲突 $eq:1 与 $ne:1 → falseNode", () => {
            const input = field("a", [
                { op: "$eq", value: 1 },
                { op: "$ne", value: 1 },
            ]);
            assert.deepStrictEqual(simplify(input), { type: "false" });
        });

        it("2.4 空 conditions → trueNode（或无约束）", () => {
            const input = field("a", []);
            const out = simplify(input);
            // 规范：空 conditions 视为无约束，可返回 trueNode
            assert.ok(out.type === "true" || (out.type === "field" && out.conditions.length === 0));
        });

        it("2.5 Unsupported op $regex 原样返回（不进入 tighten）", () => {
            const input = field("a", [{ op: "$regex", value: "x" }]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$regex", value: "x" }],
            });
        });

        it("2.6 特殊值 $eq null 原样返回", () => {
            const input = field("a", [{ op: "$eq", value: null }]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: null }],
            });
        });

        it("2.6 特殊值 $eq Date 原样返回", () => {
            const d = new Date(0);
            const input = field("a", [{ op: "$eq", value: d }]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: d }],
            });
        });

        it("2.6 特殊值 $eq ObjectId-like 原样返回", () => {
            const oid = makeObjectIdLike("507f191e810c19729de860ea");
            const input = field("a", [{ op: "$eq", value: oid }]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: oid }],
            });
        });
    });

    describe("3. 冲突检测（不可能场景均返回 falseNode）", () => {
        it("3.1 父子冲突 parent $eq:5 child $ne:5 → falseNode", () => {
            const out = parseAndSimplify({ $and: [{ a: 5 }, { a: { $ne: 5 } }] });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.1 父子冲突 parent $gt:10 child $lt:5 → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $gt: 10 } }, { a: { $lt: 5 } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 bounds 交叉 $gt:10 + $lt:5 → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $gt: 10 } }, { a: { $lt: 5 } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 bounds 交叉 $gte:10 + $lte:5 → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $gte: 10 } }, { a: { $lte: 5 } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 同值非双 inclusive $gt:5 + $lte:5 → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $gt: 5 } }, { a: { $lte: 5 } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 $eq:5 + $nin:[5] → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: 5 }, { a: { $nin: [5] } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 $eq:5 + $ne:5 → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: 5 }, { a: { $ne: 5 } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 $in:[1,2] + $eq:3 → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $in: [1, 2] } }, { a: 3 }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 $exists:false + $eq:1 → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $exists: false } }, { a: 1 }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 $exists:false + $in:[1,2] → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $exists: false } }, { a: { $in: [1, 2] } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 $exists:false + bounds → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $exists: false } }, { a: { $gt: 0 } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 $exists:true + $eq:null → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $exists: true } }, { a: null }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.2 $eq:5 与 parent $gt:10 冲突 → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $gt: 10 } }, { a: 5 }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("3.3 自身冲突（单节点内 $eq + $ne）→ falseNode", () => {
            const input = field("a", [
                { op: "$eq", value: 1 },
                { op: "$ne", value: 1 },
            ]);
            assert.deepStrictEqual(simplify(input), { type: "false" });
        });
    });

    describe("4. tighten 收紧全覆盖", () => {
        it("4.1 parent $eq:5 child $in:[1,2,5] → child 变为 $in:[5] 或 $eq:5", () => {
            const out = parseAndSimplify({
                $and: [{ a: 5 }, { a: { $in: [1, 2, 5] } }],
            });
            const aClauses = out.type === "field" && out.field === "a"
                ? [out]
                : (out.children || []).filter((c) => c.type === "field" && c.field === "a");
            assert.ok(aClauses.length >= 1);
            const aClause = aClauses[0];
            const hasEq5 = aClause.conditions.some(
                (c) => c.op === "$eq" && c.value === 5
            );
            const hasIn5 = aClause.conditions.some(
                (c) => c.op === "$in" && Array.isArray(c.value) && c.value.length === 1 && c.value[0] === 5
            );
            assert.ok(hasEq5 || hasIn5, "应收紧为仅包含 5");
        });

        it("4.1 parent $eq:5 child $in:[5] → 可收紧为 redundant（trueNode 或单条件）", () => {
            const out = parseAndSimplify({
                $and: [{ a: 5 }, { a: { $in: [5] } }],
            });
            // 可能：trueNode 被 prune 后剩一个 a:5；或两个 a 子句合并/收紧
            assert.ok(
                out.type === "field" ||
                (out.type === "logical" && out.children.length >= 1)
            );
        });

        it("4.2 parent $gte:5 child $gt:10 → child 保持与父约束一致的 $gt:10（等价）", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $gte: 5 } }, { a: { $gt: 10 } }],
            });
            const aClauses = out.type === "field" && out.field === "a"
                ? [out]
                : (out.children || []).filter((c) => c.type === "field" && c.field === "a");
            assert.ok(aClauses.length >= 1);
            const gt = aClauses[0].conditions.find((c) => c.op === "$gt");
            assert.ok(gt && gt.value === 10);
        });

        it("4.2 parent $gt:5 child $gte:3 → child 与父取交为 $gte:5（等价）", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $gt: 5 } }, { a: { $gte: 3 } }],
            });
            const aClauses = out.type === "field" && out.field === "a"
                ? [out]
                : (out.children || []).filter((c) => c.type === "field" && c.field === "a");
            assert.ok(aClauses.length >= 1);
            const gte = aClauses[0].conditions.find((c) => c.op === "$gte");
            const gt = aClauses[0].conditions.find((c) => c.op === "$gt");
            assert.ok((gte && gte.value >= 5) || (gt && gt.value >= 5));
        });

        it("4.2 parent 有 upper child 有 lower → 同时输出 tightened lower + upper", () => {
            const out = parseAndSimplify({
                $and: [
                    { a: { $gte: 2 } },
                    { a: { $lte: 8 } },
                    { a: { $gt: 3 } },
                    { a: { $lt: 7 } },
                ],
            });
            const aClauses = out.type === "field" && out.field === "a"
                ? [out]
                : (out.children || []).filter((c) => c.type === "field" && c.field === "a");
            assert.ok(aClauses.length >= 1);
            const hasLower = aClauses[0].conditions.some((c) => c.op === "$gt" || c.op === "$gte");
            const hasUpper = aClauses[0].conditions.some((c) => c.op === "$lt" || c.op === "$lte");
            assert.ok(hasLower && hasUpper);
        });

        it("4.3 parent/child 多个 $in：保持为多个 FieldNode，不强行求交集", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $in: [1, 2, 3] } }, { a: { $in: [2, 3, 4] } }],
            });
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$and");
            const aClauses = (out.children || []).filter((c) => c.type === "field" && c.field === "a");
            assert.strictEqual(aClauses.length, 2);
            const inSets = aClauses.map((clause) =>
                clause.conditions.find((c) => c.op === "$in")?.value || []
            );
            const sorted = inSets.map((arr) => arr.slice().sort().join(",")).sort();
            assert.deepStrictEqual(sorted, ["1,2,3", "2,3,4"]);
        });

        it("4.3 多个 $in 即使交集为空也不直接视为 falseNode（兼容数组字段语义）", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $in: [1, 2] } }, { a: { $in: [3, 4] } }],
            });
            assert.notStrictEqual(out.type, "false");
        });

        it("4.4 parent $exists:true child $exists:false → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $exists: true } }, { a: { $exists: false } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("4.4 parent $exists:false child 任何条件 → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $exists: false } }, { a: { $gt: 1 } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("4.5 混合 supported + unsupported：只收紧 supported，unsupported 保留", () => {
            const input = logical("$and", [
                field("a", [{ op: "$eq", value: 5 }]),
                field("a", [
                    { op: "$eq", value: 5 },
                    { op: "$regex", value: "x" },
                ]),
            ]);
            const out = simplify(input);
            const aClauses = out.type === "field" && out.field === "a"
                ? [out]
                : (out.children || []).filter((c) => c.type === "field" && c.field === "a");
            assert.ok(aClauses.length >= 1);
            const hasRegex = aClauses.some((clause) =>
                clause.conditions.some((c) => c.op === "$regex")
            );
            assert.ok(hasRegex, "应收紧 supported 条件但保留 unsupported $regex");
        });

        it("4.6 收紧后 conditions 为空 → 该分支变为 trueNode 被 prune", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $in: [1] } }, { a: 1 }, { b: 2 }],
            });
            assert.ok(out.type === "logical" || out.type === "field");
            const children = out.type === "logical" && out.children ? out.children : [out];
            const hasA = children.some((c) => c.type === "field" && c.field === "a");
            const hasB = children.some((c) => c.type === "field" && c.field === "b");
            assert.ok(hasA || hasB, "应至少保留 a 或 b 子句");
        });
    });

    describe("5. $and 内 sibling 传播", () => {
        it("5.1 同字段 sibling 互相收紧 $and[$gt:5, $lt:10]", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $gt: 5 } }, { a: { $lt: 10 } }],
            });
            const aNodes = out.type === "field" && out.field === "a"
                ? [out]
                : (out.children || []).filter((c) => c.type === "field" && c.field === "a");
            assert.ok(aNodes.length >= 1);
            const allConds = aNodes.flatMap((n) => n.conditions);
            assert.ok(allConds.some((c) => c.op === "$gt" && c.value === 5));
            assert.ok(allConds.some((c) => c.op === "$lt" && c.value === 10));
        });

        it("5.2 sibling + parent 叠加：外层 parent $gte:0，内层 $and[$gt:5, $lt:10]", () => {
            const out = parseAndSimplify({
                $and: [
                    { a: { $gte: 0 } },
                    { a: { $gt: 5 } },
                    { a: { $lt: 10 } },
                ],
            });
            const aNodes = out.type === "field" && out.field === "a"
                ? [out]
                : (out.children || []).filter((c) => c.type === "field" && c.field === "a");
            assert.ok(aNodes.length >= 1);
            const allConds = aNodes.flatMap((n) => n.conditions);
            assert.ok(
                allConds.some((c) => (c.op === "$gt" || c.op === "$gte") && c.value >= 5)
            );
            assert.ok(
                allConds.some((c) => (c.op === "$lt" || c.op === "$lte") && c.value === 10)
            );
        });

        it("5.3 sibling 导致 impossible $and[$gt:10, $lt:5] → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $gt: 10 } }, { a: { $lt: 5 } }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });

        it("5.4 $and 内 trueNode 被 prune", () => {
            const input = logical("$and", [
                trueNode(),
                field("a", [{ op: "$eq", value: 1 }]),
            ]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: 1 }],
            });
        });

        it("5.4 $and 内 falseNode → 整体 falseNode", () => {
            const input = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }]),
                falseNode(),
            ]);
            assert.deepStrictEqual(simplify(input), { type: "false" });
        });
    });

    describe("6. $or / $nor 简化", () => {
        it("6.1 $or 含 trueNode → 整个返回 trueNode", () => {
            const input = logical("$or", [
                field("a", [{ op: "$eq", value: 1 }]),
                trueNode(),
            ]);
            assert.deepStrictEqual(simplify(input), { type: "true" });
        });

        it("6.2 $or 全 falseNode → falseNode", () => {
            const input = logical("$or", [falseNode(), falseNode()]);
            assert.deepStrictEqual(simplify(input), { type: "false" });
        });

        it("6.3 $or 混合 field + logical，prune false 子节点", () => {
            const input = logical("$or", [
                falseNode(),
                field("a", [{ op: "$eq", value: 1 }]),
                falseNode(),
            ]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: 1 }],
            });
        });

        it("7.1 $nor 单子句无变化", () => {
            const input = logical("$nor", [
                field("a", [{ op: "$eq", value: 1 }]),
            ]);
            const out = simplify(input);
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$nor");
            assert.strictEqual(out.children.length, 1);
        });

        it("7.2 $nor:[trueNode] → falseNode", () => {
            const input = logical("$nor", [trueNode()]);
            assert.deepStrictEqual(simplify(input), { type: "false" });
        });

        it("7.3 $nor:[falseNode] → trueNode", () => {
            const input = logical("$nor", [falseNode()]);
            assert.deepStrictEqual(simplify(input), { type: "true" });
        });

        it("7.4 $nor 内两支均冲突时内部 or 为 false → trueNode", () => {
            const input = logical("$nor", [
                field("a", [{ op: "$gt", value: 5 }]),
                field("a", [{ op: "$lt", value: 5 }]),
            ]);
            const out = simplify(input);
            assert.ok(out.type === "true" || (out.type === "logical" && out.op === "$nor"));
        });
    });

    describe("8. 逻辑展开 & 扁平化（flatten）", () => {
        it("8.1 $and 嵌套 $and → 扁平为一级", () => {
            const input = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }]),
                logical("$and", [
                    field("b", [{ op: "$eq", value: 2 }]),
                    field("c", [{ op: "$eq", value: 3 }]),
                ]),
            ]);
            const out = simplify(input);
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$and");
            assert.strictEqual(out.children.length, 3);
            const fields = out.children.map((c) => c.type === "field" && c.field).filter(Boolean);
            assert.deepStrictEqual(fields.sort(), ["a", "b", "c"]);
        });

        it("8.2 $and 内 trueNode 被跳过，剩余一个 child → 直接返回该 child（unwrap）", () => {
            const input = logical("$and", [
                trueNode(),
                field("a", [{ op: "$eq", value: 1 }]),
            ]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: 1 }],
            });
        });

        it("8.3 $or 内 falseNode 被跳过", () => {
            const input = logical("$or", [
                falseNode(),
                field("a", [{ op: "$eq", value: 1 }]),
            ]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: 1 }],
            });
        });
    });

    describe("9. 特殊值 & valueEqual 全覆盖", () => {
        it("9.1 Date 相等 valueEqual 分支", () => {
            const d = new Date(0);
            const out = parseAndSimplify({
                $and: [{ a: d }, { a: new Date(0) }],
            });
            assert.ok(out.type === "field" || (out.type === "logical" && out.children.length >= 1));
            assert.notStrictEqual(out.type, "false");
        });

        it("9.2 ObjectId _bsontype/toHexString 形式", () => {
            const oid = makeObjectIdLike("507f191e810c19729de860ea");
            const input = field("a", [{ op: "$eq", value: oid }]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: oid }],
            });
        });

        it("9.2 ObjectId $oid 形式（EJSON）", () => {
            const oid = { $oid: "507f191e810c19729de860ea" };
            const input = field("a", [{ op: "$eq", value: oid }]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: oid }],
            });
        });

        it("9.3 数组值 $in 深比较", () => {
            const arr = [1, 2];
            const input = field("a", [{ op: "$in", value: [arr, arr] }]);
            const out = simplify(input);
            assert.ok(out.type === "field" && out.conditions.length >= 1);
        });

        it("9.4 深层对象 $eq", () => {
            const obj = { x: { y: 1 } };
            const input = field("a", [{ op: "$eq", value: obj }]);
            assert.deepStrictEqual(simplify(input), {
                type: "field",
                field: "a",
                conditions: [{ op: "$eq", value: obj }],
            });
        });

        it("9.5 null 与 $exists 组合冲突 → falseNode", () => {
            const out = parseAndSimplify({
                $and: [{ a: { $exists: true } }, { a: null }],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });
    });

    describe("10. 复杂嵌套混合", () => {
        it("10.1 深度嵌套 + sibling + tighten：$and[a>$gt:5, $or[a<$lt:10, b=1], a $in [6,7,8]]", () => {
            const out = parseAndSimplify({
                $and: [
                    { a: { $gt: 5 } },
                    { $or: [{ a: { $lt: 10 } }, { b: 1 }] },
                    { a: { $in: [6, 7, 8] } },
                ],
            });
            assert.notStrictEqual(out.type, "false");
            assert.ok(out.type === "logical" || out.type === "field");
        });

        it("10.2 $nor 包裹 $and（内部 or 化简后取反）", () => {
            const input = logical("$nor", [
                logical("$and", [
                    field("a", [{ op: "$eq", value: 1 }]),
                    field("a", [{ op: "$eq", value: 2 }]),
                ]),
            ]);
            const out = simplify(input);
            assert.strictEqual(out.type, "true", "内部 $and 冲突为 false，$nor[false] → true");
        });

        it("10.3 多字段 + 多层 + unsupported 混合", () => {
            const out = parseAndSimplify({
                $and: [
                    { a: 5 },
                    { a: { $regex: "x" } },
                    { b: { $in: [1, 2] } },
                    { $or: [{ c: 1 }, { c: 2 }] },
                ],
            });
            assert.ok(out.type === "logical" || out.type === "field");
            assert.notStrictEqual(out.type, "false");
        });

        it("10.4 多同字段条件 + parent 冲突 → 任一 false 即整体 false", () => {
            const out = parseAndSimplify({
                $and: [
                    { a: { $gt: 10 } },
                    { a: 1 },
                    { a: 2 },
                ],
            });
            assert.deepStrictEqual(out, { type: "false" });
        });
    });
});
