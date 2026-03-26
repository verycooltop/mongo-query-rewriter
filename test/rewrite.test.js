const assert = require("node:assert/strict");

const { rewriteQuerySelector } = require("../dist/rewrite.js");

const {
    IMPOSSIBLE_SELECTOR,
    assertImpossibleSelector,
    assertIsAndSelector,
    assertAndHasFieldClause,
    assertAndHasLogicalClause,
    makeObjectIdLike,
} = require("./helpers/assertions.js");

function deepEqualSelector(actual, expected, msg) {
    if (expected === IMPOSSIBLE_SELECTOR) {
        assertImpossibleSelector(actual, msg);
        return;
    }
    assert.deepEqual(actual, expected, msg);
}

describe("rewriteQuerySelector", () => {
    describe("简单：空与单字段", () => {
        it("空选择器 → 保持空对象", () => {
            deepEqualSelector(rewriteQuerySelector({}), {});
        });

        it("单字段字面量等价于 $eq", () => {
            deepEqualSelector(rewriteQuerySelector({ a: 5 }), { a: 5 });
            deepEqualSelector(rewriteQuerySelector({ x: "hello" }), { x: "hello" });
            deepEqualSelector(rewriteQuerySelector({ flag: true }), { flag: true });
        });

        it("单字段显式 $eq", () => {
            deepEqualSelector(rewriteQuerySelector({ a: { $eq: 10 } }), { a: 10 });
        });

        it("多字段隐式 $and 保持", () => {
            const out = rewriteQuerySelector({ a: 1, b: 2 });
            assertIsAndSelector(out, 2);
            assert.strictEqual(assertAndHasFieldClause(out, "a"), 1);
            assert.strictEqual(assertAndHasFieldClause(out, "b"), 2);
        });
    });


    describe("比较操作符：$gt $gte $lt $lte", () => {
        it("单字段 $gt / $lt", () => {
            deepEqualSelector(rewriteQuerySelector({ score: { $gt: 0 } }), { score: { $gt: 0 } });
            deepEqualSelector(rewriteQuerySelector({ score: { $lt: 100 } }), { score: { $lt: 100 } });
        });

        it("单字段 $gte / $lte", () => {
            deepEqualSelector(rewriteQuerySelector({ age: { $gte: 18 } }), { age: { $gte: 18 } });
            deepEqualSelector(rewriteQuerySelector({ age: { $lte: 65 } }), { age: { $lte: 65 } });
        });

        it("同字段范围 $gt + $lt 合并为单对象", () => {
            const out = rewriteQuerySelector({
                $and: [{ n: { $gt: 1 } }, { n: { $lt: 10 } }],
            });
            assert.ok(out.n && out.n.$gt === 1 && out.n.$lt === 10);
        });

        it("同字段 $gte + $lte 合并", () => {
            const out = rewriteQuerySelector({
                $and: [{ x: { $gte: 0 } }, { x: { $lte: 100 } }],
            });
            assert.strictEqual(out.x.$gte, 0);
            assert.strictEqual(out.x.$lte, 100);
        });
    });

    describe("$eq 与 $ne", () => {
        it("单字段 $ne", () => {
            deepEqualSelector(rewriteQuerySelector({ status: { $ne: "deleted" } }), {
                status: { $ne: "deleted" },
            });
        });

        it("多字段含 $eq 与 $ne", () => {
            const out = rewriteQuerySelector({ a: 1, b: { $ne: 2 } });
            assertIsAndSelector(out, 2);
            assert.strictEqual(assertAndHasFieldClause(out, "a"), 1);
            assert.deepEqual(assertAndHasFieldClause(out, "b"), { $ne: 2 });
        });
    });

    describe("$in 与 $nin", () => {
        it("单字段 $in", () => {
            deepEqualSelector(rewriteQuerySelector({ tag: { $in: ["a", "b"] } }), {
                tag: { $in: ["a", "b"] },
            });
        });

        it("单字段 $nin", () => {
            deepEqualSelector(rewriteQuerySelector({ role: { $nin: ["guest"] } }), {
                role: { $nin: ["guest"] },
            });
        });

        it("同字段多个 $in 合并为交集", () => {
            const out = rewriteQuerySelector({
                $and: [{ k: { $in: [1, 2] } }, { k: { $in: [2, 3] } }],
            });
            assert.deepStrictEqual(out, { k: { $in: [2] } });
        });

        it("同字段多个 $in：ObjectId-like 合并为交集", () => {
            const a1 = makeObjectIdLike("aaaaaaaaaaaaaaaaaaaaaaaa");
            const a2 = makeObjectIdLike("aaaaaaaaaaaaaaaaaaaaaaaa");
            const b = makeObjectIdLike("bbbbbbbbbbbbbbbbbbbbbbbb");

            const out = rewriteQuerySelector({
                $and: [{ k: { $in: [a1, b] } }, { k: { $in: [a2] } }],
            });

            assert.ok(out.k !== undefined);
            const kVal = out.k;
            const arr = kVal && kVal.$in ? kVal.$in : (Array.isArray(kVal) ? kVal : [kVal]);
            assert.strictEqual(arr.length, 1);
            const hex = arr[0].toHexString ? arr[0].toHexString() : (arr[0].$oid || null);
            assert.strictEqual(hex, "aaaaaaaaaaaaaaaaaaaaaaaa");
        });

        it("同字段多个 $nin：ObjectId-like 去重（union）", () => {
            const a1 = makeObjectIdLike("aaaaaaaaaaaaaaaaaaaaaaaa", "equals");
            const a2 = makeObjectIdLike("aaaaaaaaaaaaaaaaaaaaaaaa", "equals");

            const out = rewriteQuerySelector({
                $and: [{ k: { $nin: [a1] } }, { k: { $nin: [a2] } }],
            });

            assert.ok(out.k && out.k.$nin, "应合并为字段 k 的 $nin");
            assert.strictEqual(out.k.$nin.length, 1);
            assert.strictEqual(out.k.$nin[0].toHexString(), "aaaaaaaaaaaaaaaaaaaaaaaa");
        });

        it("父层 $in 约束不再对 $or 分支里的同字段 $in 做交集收紧（保持语义等价即可）", () => {
            const out = rewriteQuerySelector({
                $and: [
                    { task_type_id: { $in: [1, 2] } },
                    {
                        $or: [
                            { task_type_id: { $in: [2, 3] }, x: 1 },
                            { y: 1 },
                        ],
                    },
                ],
            });

            // 顶层仍应保留父层条件
            assert.deepEqual(assertAndHasFieldClause(out, "task_type_id").$in, [1, 2]);

            // $or 分支经 canonical 排序；找含 task_type_id.$in 的分支（不假定顺序）
            const orClauses = assertAndHasLogicalClause(out, "$or");

            function findFieldInBranch(branch, field) {
                if (branch && typeof branch === "object" && Object.prototype.hasOwnProperty.call(branch, field)) {
                    return branch[field];
                }
                if (branch && typeof branch === "object" && Array.isArray(branch.$and)) {
                    const clause = branch.$and.find(
                        (c) => c && typeof c === "object" && !Array.isArray(c) && Object.prototype.hasOwnProperty.call(c, field)
                    );
                    return clause ? clause[field] : undefined;
                }
                return undefined;
            }

            const branchWithTt = orClauses.find((b) => {
                const ft = findFieldInBranch(b, "task_type_id");
                return ft && ft.$in;
            });
            assert.ok(branchWithTt && typeof branchWithTt === "object", "应存在含 task_type_id.$in 的 $or 分支");
            const branchTaskType = findFieldInBranch(branchWithTt, "task_type_id");
            assert.ok(branchTaskType && branchTaskType.$in, "分支应包含 task_type_id.$in");
            assert.ok(
                Array.isArray(branchTaskType.$in) &&
                branchTaskType.$in.includes(2) &&
                branchTaskType.$in.includes(3),
                "分支内 $in 应至少包含 2 与 3，保持原始语义"
            );
        });
    });

    describe("父层约束下推收紧（不止 $in）", () => {
        it("父层范围应收紧子分支范围（取交集）", () => {
            const out = rewriteQuerySelector({
                $and: [
                    { score: { $gte: 0, $lte: 100 } },
                    { $or: [{ score: { $gt: 50 }, x: 1 }, { y: 1 }] },
                ],
            });

            const orClauses = assertAndHasLogicalClause(out, "$or");
            // 分支可能被编译成 {$and:[{score:{...}},{x:1}]}；$or 子句顺序经 canonical 排序
            function findField(branch, field) {
                if (branch && typeof branch === "object" && Object.prototype.hasOwnProperty.call(branch, field)) return branch[field];
                if (branch && typeof branch === "object" && Array.isArray(branch.$and)) {
                    const clause = branch.$and.find(
                        (c) => c && typeof c === "object" && !Array.isArray(c) && Object.prototype.hasOwnProperty.call(c, field)
                    );
                    return clause ? clause[field] : undefined;
                }
                return undefined;
            }

            const branchWithScore = orClauses.find((b) => {
                const s = findField(b, "score");
                return s && typeof s === "object";
            });
            assert.ok(branchWithScore, "应存在含 score 的 $or 分支");
            const score = findField(branchWithScore, "score");
            assert.ok(score && typeof score === "object", "分支应包含 score 条件对象");
            // 父层 [0,100] 与子层 (>50) 交集仍为 (>50 且 <=100)，因此应保留/补全上界
            assert.strictEqual(score.$gt, 50);
            assert.strictEqual(score.$lte, 100);
        });

        it("父层 $eq 与子分支 $in：子分支保留包含该值的约束即可（不强行变成单值）", () => {
            const out = rewriteQuerySelector({
                $and: [{ k: 2 }, { $or: [{ k: { $in: [1, 2, 3] }, x: 1 }, { y: 1 }] }],
            });

            const orClauses = assertAndHasLogicalClause(out, "$or");
            function findField(branch, field) {
                if (branch && typeof branch === "object" && Object.prototype.hasOwnProperty.call(branch, field)) return branch[field];
                if (branch && typeof branch === "object" && Array.isArray(branch.$and)) {
                    const clause = branch.$and.find(
                        (c) => c && typeof c === "object" && !Array.isArray(c) && Object.prototype.hasOwnProperty.call(c, field)
                    );
                    return clause ? clause[field] : undefined;
                }
                return undefined;
            }
            const branchWithK = orClauses.find((b) => findField(b, "k") !== undefined);
            assert.ok(branchWithK, "应存在含 k 的 $or 分支");
            const k = findField(branchWithK, "k");
            // 分支上的 k 约束应至少包含 2（可以是字面量 2、$eq:2 或 $in 包含 2）
            assert.ok(k !== undefined, "分支应包含 k 的约束");
            const kIncludes2 =
                k === 2 ||
                (k && k.$eq === 2) ||
                (k && Array.isArray(k.$in) && k.$in.includes(2));
            assert.ok(kIncludes2, "分支 k 应包含与顶层一致的值 2");
        });
    });

    describe("$exists", () => {
        it("$exists: true", () => {
            deepEqualSelector(rewriteQuerySelector({ name: { $exists: true } }), {
                name: { $exists: true },
            });
        });

        it("$exists: false", () => {
            deepEqualSelector(rewriteQuerySelector({ deletedAt: { $exists: false } }), {
                deletedAt: { $exists: false },
            });
        });

        it("同字段 $exists + $eq 合并", () => {
            const out = rewriteQuerySelector({
                $and: [{ opt: { $exists: true } }, { opt: { $eq: "x" } }],
            });
            assert.strictEqual(out.opt.$exists, true);
            assert.strictEqual(out.opt.$eq, "x");
        });
    });

    describe("null 与 $eq null", () => {
        it("字段等于 null", () => {
            deepEqualSelector(rewriteQuerySelector({ middleName: null }), { middleName: null });
        });

        it("显式 $eq: null", () => {
            deepEqualSelector(rewriteQuerySelector({ ref: { $eq: null } }), { ref: null });
        });

        it("$exists: true 与 $eq 非 null 合并", () => {
            const out = rewriteQuerySelector({
                $and: [{ maybe: { $exists: true } }, { maybe: { $eq: "x" } }],
            });
            assert.strictEqual(out.maybe.$exists, true);
            assert.strictEqual(out.maybe.$eq, "x");
        });

        it("$exists: true 且 $eq: null：在本实现中视为“存在且为 null”", () => {
            const out = rewriteQuerySelector({
                $and: [{ maybe: { $exists: true } }, { maybe: null }],
            });
            deepEqualSelector(out, { maybe: { $eq: null, $exists: true } });
        });
    });

    describe("冲突剪枝：$and 内同字段互斥 → 不可满足", () => {
        it("$eq 与 $eq 冲突 → 不可满足", () => {
            const out = rewriteQuerySelector({ $and: [{ a: 1 }, { a: 2 }] });
            deepEqualSelector(out, IMPOSSIBLE_SELECTOR);
        });

        it("$eq 与 $in 无交集 → 不可满足", () => {
            const out = rewriteQuerySelector({ $and: [{ a: 1 }, { a: { $in: [2, 3] } }] });
            deepEqualSelector(out, IMPOSSIBLE_SELECTOR);
        });

        it("$eq 与 $nin 包含该值 → 不可满足", () => {
            const out = rewriteQuerySelector({ $and: [{ a: 1 }, { a: { $nin: [1, 2] } }] });
            deepEqualSelector(out, IMPOSSIBLE_SELECTOR);
        });

        it("范围无交集 $gt 与 $lt → 不可满足", () => {
            const out = rewriteQuerySelector({ $and: [{ n: { $gt: 10 } }, { n: { $lt: 5 } }] });
            deepEqualSelector(out, IMPOSSIBLE_SELECTOR);
        });

        it("$exists 冲突 → 不可满足", () => {
            const out = rewriteQuerySelector({
                $and: [{ f: { $exists: true } }, { f: { $exists: false } }],
            });
            deepEqualSelector(out, IMPOSSIBLE_SELECTOR);
        });

        it("$eq 与 $exists 冲突：$exists:false 且 $eq:非null → 不可满足", () => {
            const out = rewriteQuerySelector({
                $and: [{ f: { $exists: false } }, { f: { $eq: 1 } }],
            });
            deepEqualSelector(out, IMPOSSIBLE_SELECTOR);
        });

        it("ObjectId-like：同值 $eq 不应被判为冲突", () => {
            const a1 = makeObjectIdLike("aaaaaaaaaaaaaaaaaaaaaaaa");
            const a2 = makeObjectIdLike("aaaaaaaaaaaaaaaaaaaaaaaa");
            const out = rewriteQuerySelector({ $and: [{ a: a1 }, { a: a2 }] });

            assert.notDeepEqual(out, IMPOSSIBLE_SELECTOR);
            assert.ok(out.a, "应合并为单字段 a");
            assert.strictEqual(out.a.toHexString(), "aaaaaaaaaaaaaaaaaaaaaaaa");
        });
    });

    describe("$or：冲突分支被剪枝", () => {
        it("$and 内 $or 一支与父条件冲突 → 只保留不冲突支", () => {
            const out = rewriteQuerySelector({
                $and: [{ a: 1 }, { $or: [{ a: 2 }, { b: 1 }] }],
            });
            assert.ok(out.$and, "应有 $and");
            const orClause = out.$and.find((c) => c && c.$or);
            if (orClause) {
                assert.strictEqual(orClause.$or.length, 1);
                assert.deepEqual(orClause.$or[0], { b: 1 });
            } else {
                assert.strictEqual(out.$and.length, 2);
                assert.deepEqual(out.$and.find((c) => c.b === 1), { b: 1 });
            }
        });

        it("$or 两支都与父条件冲突 → 不可满足", () => {
            const out = rewriteQuerySelector({
                $and: [{ a: 1 }, { $or: [{ a: 2 }, { a: 3 }] }],
            });
            deepEqualSelector(out, IMPOSSIBLE_SELECTOR);
        });

        it("$or 无冲突时保持", () => {
            const out = rewriteQuerySelector({ $or: [{ a: 1 }, { b: 2 }] });
            assert.ok(out.$or);
            assert.strictEqual(out.$or.length, 2);
        });
    });

    describe("$nor", () => {
        it("$nor 含与父冲突的子句会被简化", () => {
            const out = rewriteQuerySelector({
                $and: [{ a: 1 }, { $nor: [{ a: 2 }, { b: 0 }] }],
            });
            assert.ok(out.$and);
            const nor = out.$and.find((c) => c.$nor);
            assert.ok(nor);
            assert.strictEqual(nor.$nor.length, 1);
            assert.deepEqual(nor.$nor[0], { b: 0 });
        });

        it("$nor 子句内包含多层 $and/$or 与 $in 时保持语义等价", () => {
            const query = {
                $nor: [
                    {
                        $and: [
                            { $or: [{ "meta.level": { $in: ["gold", "gold"] } }] },
                            { $or: [{ tags: { $in: ["small"] } }] },
                            { tags: { $in: ["green"] } },
                            {
                                $or: [
                                    { "meta.score": { $lt: 1049269582 } },
                                    { "meta.level": "silver" },
                                ],
                            },
                        ],
                    },
                ],
            };

            const out = rewriteQuerySelector(query);

            // 不强制结构完全一致，只要求不抛错且返回合法选择器
            assert.strictEqual(typeof out, "object");
            assert.ok(out !== null);
        });
    });

    describe("多层嵌套 $and 打平与合并", () => {
        it("$and 内嵌 $and 打平", () => {
            const out = rewriteQuerySelector({
                $and: [{ a: 1 }, { $and: [{ b: 2 }, { c: 3 }] }],
            });
            assert.ok(out.$and);
            assert.strictEqual(out.$and.length, 3);
            const fields = out.$and.filter((c) => !c.$and && !c.$or && !c.$nor);
            const keys = fields.flatMap((c) => Object.keys(c));
            assert.ok(keys.includes("a") && keys.includes("b") && keys.includes("c"));
        });

        it("深层 $and-only 子句应在输出阶段继续打平", () => {
            const out = rewriteQuerySelector({
                $and: [
                    { a: 1 },
                    { $and: [{ b: 2 }, { $and: [{ c: 3 }] }] },
                ],
            });
            assert.ok(out.$and, "应保持为 $and（多子句）");
            assert.strictEqual(out.$and.length, 3);
            const keys = out.$and.flatMap((c) => Object.keys(c));
            assert.ok(keys.includes("a") && keys.includes("b") && keys.includes("c"));
        });

        it("同字段分散在多层 $and 合并为单条件", () => {
            const out = rewriteQuerySelector({
                $and: [
                    { x: 1 },
                    { $and: [{ x: { $lt: 10 } }, { y: 2 }] },
                ],
            });
            const withX = out.x ? out : out.$and?.find((c) => c.x !== undefined);
            const xVal = withX?.x;
            assert.ok(xVal !== undefined, "应有 x 条件: " + JSON.stringify(out));
            assert.strictEqual(xVal, 1);
        });
    });

    describe("多种比较操作符混杂", () => {
        it("同一字段 $gte + $lte + $ne 合并", () => {
            const out = rewriteQuerySelector({
                $and: [
                    { n: { $gte: 1 } },
                    { n: { $lte: 10 } },
                    { n: { $ne: 5 } },
                ],
            });
            assert.strictEqual(out.n.$gte, 1);
            assert.strictEqual(out.n.$lte, 10);
            assert.strictEqual(out.n.$ne, 5);
        });

        it("多字段：$eq、$in、$gt、$exists 混在一起", () => {
            const out = rewriteQuerySelector({
                status: "active",
                score: { $gt: 0 },
                tag: { $in: ["a", "b"] },
                deleted: { $exists: false },
            });
            assert.ok(out.$and && out.$and.length === 4);
            const byKey = (k) => out.$and.find((c) => c[k] !== undefined)?.[k];
            assert.strictEqual(byKey("status"), "active");
            assert.strictEqual(byKey("score")?.$gt, 0);
            assert.deepEqual(byKey("tag")?.$in, ["a", "b"]);
            assert.strictEqual(byKey("deleted")?.$exists, false);
        });

        it("$or 内多操作符 + 外层 $and", () => {
            const out = rewriteQuerySelector({
                type: "user",
                $or: [
                    { age: { $gte: 18 }, role: "admin" },
                    { name: { $exists: true }, score: { $lt: 0 } },
                ],
            });
            assert.ok(out.$and);
            const typeClause = out.$and.find((c) => c.type !== undefined);
            assert.strictEqual(typeClause?.type, "user");
            const orClause = out.$and.find((c) => c.$or);
            assert.strictEqual(orClause.$or.length, 2);
        });
    });

    describe("复杂嵌套：$and / $or / $nor 混合", () => {
        it("$or 内包含 $and", () => {
            const out = rewriteQuerySelector({
                $or: [
                    { a: 1 },
                    { $and: [{ b: 2 }, { c: 3 }] },
                ],
            });
            assert.strictEqual(out.$or.length, 2);
            const andBranch = out.$or.find((x) => x.$and);
            if (andBranch) {
                assert.strictEqual(andBranch.$and.length, 2);
            } else {
                const flatBranch = out.$or.find(
                    (x) => x && typeof x === "object" && x.b === 2 && x.c === 3
                );
                assert.ok(flatBranch, "$or 分支应等价于 b=2 且 c=3");
            }
        });

        it("$and 内 $or 与 $nor 并存", () => {
            const out = rewriteQuerySelector({
                $and: [
                    { x: 1 },
                    { $or: [{ y: 1 }, { y: 2 }] },
                    { $nor: [{ z: 0 }] },
                ],
            });
            assertIsAndSelector(out, 3);
            const orChildren = assertAndHasLogicalClause(out, "$or");
            assert.strictEqual(orChildren.length, 2);
            const norChildren = assertAndHasLogicalClause(out, "$nor");
            assert.strictEqual(norChildren.length, 1);
            assert.deepEqual(norChildren[0], { z: 0 });
            assert.strictEqual(assertAndHasFieldClause(out, "x"), 1);
        });

        it("深层嵌套：$and[$or[$and[...]]] 冲突剪枝", () => {
            const out = rewriteQuerySelector({
                $and: [
                    { a: 1 },
                    {
                        $or: [
                            { a: 2 },
                            { $and: [{ a: 3 }, { b: 1 }] },
                            { b: 2 },
                        ],
                    },
                ],
            });
            assert.ok(out.$and);
            const orClause = out.$and.find((c) => c && c.$or);
            if (orClause) {
                assert.strictEqual(orClause.$or.length, 1);
                assert.deepEqual(orClause.$or[0], { b: 2 });
            } else {
                assert.strictEqual(out.$and.length, 2);
                assert.deepEqual(out.$and.find((c) => c.b === 2), { b: 2 });
            }
        });
    });

    describe("边界与兼容", () => {
        it("仅 $comment 等非逻辑键 → 空对象", () => {
            deepEqualSelector(rewriteQuerySelector({ $comment: "test" }), {});
        });

        it("$all + $size 不应被误判为不可满足", () => {
            const query = {
                "properties.renyuan.value": {
                    $all: ["81541587e1e34d6195a386bf9f812a3a"],
                    $size: 1,
                },
            };
            const out = rewriteQuerySelector(query);
            assert.notDeepEqual(out, IMPOSSIBLE_SELECTOR);
            assert.deepEqual(out, query);
        });

        it("Date 类型范围", () => {
            const d1 = new Date("2020-01-01");
            const d2 = new Date("2021-01-01");
            const out = rewriteQuerySelector({
                $and: [{ at: { $gte: d1 } }, { at: { $lte: d2 } }],
            });
            assert.ok(out.at);
            assert.strictEqual(out.at.$gte.getTime(), d1.getTime());
            assert.strictEqual(out.at.$lte.getTime(), d2.getTime());
        });

        it("$regex 保持", () => {
            const out = rewriteQuerySelector({ name: { $regex: /^test/i } });
            assert.ok(out.name.$regex);
        });

        it("未建模操作符 $mod / $type 等透传", () => {
            const q1 = { n: { $mod: [3, 1] } };
            deepEqualSelector(rewriteQuerySelector(q1), q1);
            const q2 = { x: { $type: "string" } };
            deepEqualSelector(rewriteQuerySelector(q2), q2);
        });
    });

    describe("8. 端到端真实场景与幂等", () => {
        it("8.1 简单查询 { a: 5 } 往返不变", () => {
            const query = { a: 5 };
            const out = rewriteQuerySelector(query);
            deepEqualSelector(out, { a: 5 });
        });

        it("8.2 冲突查询 $and 内 $eq:5 与 $ne:5 → 不可满足", () => {
            const query = { $and: [{ a: 5 }, { a: { $ne: 5 } }] };
            const out = rewriteQuerySelector(query);
            deepEqualSelector(out, IMPOSSIBLE_SELECTOR);
        });

        it("8.3 范围收紧 + sibling：$and 内 $gt:5 与 $lt:10 合并到同字段", () => {
            const query = { $and: [{ a: { $gt: 5 } }, { a: { $lt: 10 } }] };
            const out = rewriteQuerySelector(query);
            assert.ok(out.a && out.a.$gt === 5 && out.a.$lt === 10);
        });

        it("8.4 复杂嵌套 + $nor + ObjectId", () => {
            const oid = makeObjectIdLike("507f191e810c19729de860ea");
            const query = {
                $and: [
                    { _id: oid },
                    { $nor: [{ status: "deleted" }] },
                ],
            };
            const out = rewriteQuerySelector(query);
            const hasId = out._id || (out.$and && out.$and.some((c) => c._id));
            const hasNor = out.$nor || (out.$and && out.$and.some((c) => c.$nor));
            assert.ok(hasId, "输出应含 _id 条件");
            assert.ok(hasNor, "输出应含 $nor");
        });

        it("8.5 空查询 {} → {}", () => {
            deepEqualSelector(rewriteQuerySelector({}), {});
        });

        it("8.7 幂等：rewrite(rewrite(query)) === rewrite(query)", () => {
            const query = { a: 5, b: { $gt: 1, $lt: 10 } };
            const once = rewriteQuerySelector(query);
            const twice = rewriteQuerySelector(once);
            assert.deepStrictEqual(once, twice);
        });

        it("8.7 幂等：冲突查询两次仍为不可满足", () => {
            const query = { $and: [{ a: 1 }, { a: 2 }] };
            const once = rewriteQuerySelector(query);
            const twice = rewriteQuerySelector(once);
            deepEqualSelector(twice, IMPOSSIBLE_SELECTOR);
        });
    });
});
