"use strict";

const fc = require("fast-check");
const { ObjectId } = require("mongodb");
const { getFcConfig } = require("./fc-config.js");

const DATE_MIN = new Date("2020-01-01T00:00:00.000Z");
const DATE_MAX = new Date("2025-12-31T23:59:59.999Z");

const STATUS_POOL = ["open", "closed", "draft", null];
const REGION_POOL = ["apac", "emea", "us", null];
const TAG_POOL = ["alpha", "beta", "gamma", "delta", "x"];

const dateArb = fc.date({ min: DATE_MIN, max: DATE_MAX });

/**
 * 单条文档：固定 schema，刻意混合「缺字段 / null / 有值」以覆盖 $exists 与 null 语义。
 */
function docArb() {
    return fc
        .tuple(
            fc.boolean(),
            fc.boolean(),
            fc.constantFrom("open", "closed", "draft"),
            fc.oneof(fc.constant("missing"), fc.constant("null"), fc.integer({ min: -30, max: 30 })),
            fc.integer({ min: -100, max: 100 }),
            fc.boolean(),
            fc.integer({ min: 0, max: 5000 }),
            dateArb,
            fc.oneof(fc.constant("missing"), fc.constant("partial"), fc.constant("full")),
            fc.boolean(),
            fc.boolean(),
            fc.integer({ min: 0, max: 10 }),
            fc.constantFrom(...REGION_POOL),
            fc.array(fc.constantFrom(...TAG_POOL), { minLength: 0, maxLength: 3 })
        )
        .map(
            ([
                hasStatus,
                statusIsNull,
                statusEnum,
                prioritySpec,
                score,
                archived,
                ownerId,
                createdAt,
                profileShape,
                missProfileLevel,
                missProfileRegion,
                levelVal,
                regionVal,
                tags,
            ]) => {
                const doc = {
                    _id: new ObjectId(),
                    score,
                    archived,
                    ownerId,
                    createdAt,
                    tags,
                };
                if (hasStatus) {
                    doc.status = statusIsNull ? null : statusEnum;
                }
                if (prioritySpec === "missing") {
                    /* omit */
                } else if (prioritySpec === "null") {
                    doc.priority = null;
                } else {
                    doc.priority = prioritySpec;
                }
                if (profileShape === "missing") {
                    /* omit profile */
                } else if (profileShape === "partial") {
                    doc.profile = {};
                    if (!missProfileLevel) {
                        doc.profile.level = levelVal;
                    }
                    if (!missProfileRegion) {
                        doc.profile.region = regionVal;
                    }
                } else {
                    doc.profile = { level: levelVal, region: regionVal };
                }
                return doc;
            }
        );
}

function statusLeafArb() {
    const v = fc.constantFrom(...STATUS_POOL);
    return fc.oneof(
        v.map((x) => ({ status: x })),
        v.map((x) => ({ status: { $eq: x } })),
        v.map((x) => ({ status: { $ne: x } })),
        fc.subarray(STATUS_POOL, { minLength: 1, maxLength: 4 }).map((arr) => ({ status: { $in: [...arr] } })),
        fc.subarray(STATUS_POOL, { minLength: 1, maxLength: 4 }).map((arr) => ({ status: { $nin: [...arr] } })),
        fc.boolean().map((b) => ({ status: { $exists: b } }))
    );
}

function numberLeafArb(path, min = -100, max = 100) {
    const n = fc.integer({ min, max });
    const pool = fc.uniqueArray(fc.integer({ min: min, max: max }), { minLength: 1, maxLength: 5 });
    return fc.oneof(
        n.map((x) => ({ [path]: x })),
        n.map((x) => ({ [path]: { $eq: x } })),
        n.map((x) => ({ [path]: { $ne: x } })),
        n.map((x) => ({ [path]: { $gt: x } })),
        n.map((x) => ({ [path]: { $gte: x } })),
        n.map((x) => ({ [path]: { $lt: x } })),
        n.map((x) => ({ [path]: { $lte: x } })),
        pool.map((arr) => ({ [path]: { $in: arr } })),
        pool.map((arr) => ({ [path]: { $nin: arr } })),
        fc.boolean().map((b) => ({ [path]: { $exists: b } }))
    );
}

function archivedLeafArb() {
    return fc.oneof(
        fc.boolean().map((b) => ({ archived: b })),
        fc.boolean().map((b) => ({ archived: { $eq: b } })),
        fc.boolean().map((b) => ({ archived: { $ne: b } })),
        fc.boolean().map((b) => ({ archived: { $exists: b } }))
    );
}

function createdAtLeafArb() {
    const d = dateArb;
    return fc.oneof(
        d.map((x) => ({ createdAt: x })),
        d.map((x) => ({ createdAt: { $eq: x } })),
        d.map((x) => ({ createdAt: { $gt: x } })),
        d.map((x) => ({ createdAt: { $gte: x } })),
        d.map((x) => ({ createdAt: { $lt: x } })),
        d.map((x) => ({ createdAt: { $lte: x } })),
        fc.boolean().map((b) => ({ createdAt: { $exists: b } }))
    );
}

function profileLevelLeafArb() {
    return numberLeafArb("profile.level", 0, 20);
}

function profileRegionLeafArb() {
    const v = fc.constantFrom(...REGION_POOL);
    return fc.oneof(
        v.map((x) => ({ "profile.region": x })),
        v.map((x) => ({ "profile.region": { $eq: x } })),
        v.map((x) => ({ "profile.region": { $ne: x } })),
        fc.subarray(REGION_POOL, { minLength: 1, maxLength: 4 }).map((arr) => ({ "profile.region": { $in: [...arr] } })),
        fc.subarray(REGION_POOL, { minLength: 1, maxLength: 4 }).map((arr) => ({ "profile.region": { $nin: [...arr] } })),
        fc.boolean().map((b) => ({ "profile.region": { $exists: b } }))
    );
}

/** 叶子：仅允许建模的标量 / 嵌套 path，不含 tags 与数组算子。 */
function leafPredicateArb() {
    return fc.oneof(
        statusLeafArb(),
        numberLeafArb("score"),
        numberLeafArb("priority", -50, 50),
        numberLeafArb("ownerId", 0, 6000),
        archivedLeafArb(),
        createdAtLeafArb(),
        profileLevelLeafArb(),
        profileRegionLeafArb()
    );
}

/**
 * 查询树：最大深度 4；$and/$or 子句数 2–4。
 */
function queryAtDepth(d) {
    const leaf = leafPredicateArb();
    if (d <= 0) {
        return leaf;
    }
    const inner = queryAtDepth(d - 1);
    return fc.oneof(
        leaf,
        fc.array(inner, { minLength: 2, maxLength: 4 }).map((c) => ({ $and: c })),
        fc.array(inner, { minLength: 2, maxLength: 4 }).map((c) => ({ $or: c }))
    );
}

const queryArb = queryAtDepth(4);

const sortArb = fc.oneof(
    fc.constant({ _id: 1 }),
    fc.constant({ _id: -1 }),
    fc.constant({ score: 1, _id: 1 }),
    fc.constant({ priority: -1, _id: 1 }),
    fc.constant({ ownerId: 1, score: -1, _id: 1 }),
    fc.constant({ createdAt: 1, _id: 1 })
);

const skipArb = fc.integer({ min: 0, max: 20 });
const limitArb = fc.integer({ min: 1, max: 30 });

function docsBatchArb() {
    return fc.array(docArb(), { minLength: 20, maxLength: 120 });
}

function docsBatchArbRich() {
    return fc.array(docArbRich(), { minLength: 24, maxLength: 100 });
}

/**
 * 更丰富文档：profile 类型漂移、深层路径 profile.meta.*、tags 标量/对象/混合、偶发「脏」结构。
 */
function docArbRich() {
    const profileArb = fc.oneof(
        fc.constant({ kind: "missing" }),
        fc.constant({ kind: "null" }),
        fc.tuple(fc.string({ minLength: 0, maxLength: 12 }), fc.integer({ min: -5, max: 5 })).map(([s, n]) => ({
            kind: "scalar_str",
            str: s,
            noise: n,
        })),
        fc.integer({ min: -1000, max: 1000 }).map((n) => ({ kind: "scalar_num", n })),
        fc.constant({ kind: "empty_obj" }),
        fc
            .tuple(
                fc.integer({ min: 0, max: 25 }),
                fc.constantFrom(...REGION_POOL),
                fc.boolean(),
                fc.boolean()
            )
            .map(([level, region, missLevel, missRegion]) => ({
                kind: "flat",
                level: missLevel ? undefined : level,
                region: missRegion ? undefined : region,
                missLevel,
                missRegion,
            })),
        fc
            .tuple(
                fc.integer({ min: 0, max: 20 }),
                fc.constantFrom(...REGION_POOL),
                fc.integer({ min: 0, max: 100 }),
                fc.constantFrom("eu", "us", "ap", "xx", null)
            )
            .map(([level, region, rank, code]) => ({
                kind: "nested_meta",
                level,
                region,
                rank,
                code,
            })),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 0, maxLength: 2 }).map((arr) => ({
            kind: "array_malformed",
            arr,
        }))
    );

    const tagsArb = fc.oneof(
        fc.array(fc.constantFrom(...TAG_POOL), { minLength: 0, maxLength: 5 }),
        fc.array(fc.record({ t: fc.constantFrom(...TAG_POOL) }), { minLength: 0, maxLength: 3 }),
        fc
            .tuple(
                fc.array(fc.constantFrom(...TAG_POOL), { minLength: 0, maxLength: 2 }),
                fc.array(fc.record({ t: fc.constantFrom(...TAG_POOL) }), { minLength: 0, maxLength: 2 })
            )
            .map(([a, b]) => [...a, ...b])
    );

    return fc
        .tuple(
            fc.boolean(),
            fc.boolean(),
            fc.constantFrom("open", "closed", "draft"),
            fc.oneof(fc.constant("missing"), fc.constant("null"), fc.integer({ min: -30, max: 30 })),
            fc.integer({ min: -100, max: 100 }),
            fc.boolean(),
            fc.integer({ min: 0, max: 5000 }),
            dateArb,
            profileArb,
            tagsArb,
            fc.integer({ min: 0, max: 9999 })
        )
        .map(
            ([
                hasStatus,
                statusIsNull,
                statusEnum,
                prioritySpec,
                score,
                archived,
                ownerId,
                createdAt,
                profileSpec,
                tags,
                sparseExtra,
            ]) => {
                const doc = {
                    _id: new ObjectId(),
                    score,
                    archived,
                    ownerId,
                    createdAt,
                    tags,
                    sparseKey: sparseExtra,
                };
                if (hasStatus) {
                    doc.status = statusIsNull ? null : statusEnum;
                }
                if (prioritySpec === "missing") {
                    /* omit */
                } else if (prioritySpec === "null") {
                    doc.priority = null;
                } else {
                    doc.priority = prioritySpec;
                }

                switch (profileSpec.kind) {
                    case "missing":
                        break;
                    case "null":
                        doc.profile = null;
                        break;
                    case "scalar_str":
                        doc.profile = profileSpec.str;
                        break;
                    case "scalar_num":
                        doc.profile = profileSpec.n;
                        break;
                    case "empty_obj":
                        doc.profile = {};
                        break;
                    case "flat": {
                        doc.profile = {};
                        if (!profileSpec.missLevel) {
                            doc.profile.level = profileSpec.level;
                        }
                        if (!profileSpec.missRegion) {
                            doc.profile.region = profileSpec.region;
                        }
                        break;
                    }
                    case "nested_meta":
                        doc.profile = {
                            level: profileSpec.level,
                            region: profileSpec.region,
                            meta: {
                                rank: profileSpec.rank,
                                region: { code: profileSpec.code },
                            },
                        };
                        break;
                    case "array_malformed":
                        doc.profile = profileSpec.arr;
                        break;
                    default:
                        break;
                }
                return doc;
            }
        );
}

function tagsPredicateArb() {
    const tagVal = fc.constantFrom(...TAG_POOL);
    const tagPoolArr = fc.uniqueArray(tagVal, { minLength: 1, maxLength: 4 });
    return fc.oneof(
        tagVal.map((x) => ({ tags: x })),
        tagVal.map((x) => ({ tags: { $eq: x } })),
        tagPoolArr.map((arr) => ({ tags: { $in: [...arr] } })),
        tagPoolArr.map((arr) => ({ tags: { $nin: [...arr] } })),
        tagPoolArr.map((arr) => ({ tags: { $all: [...arr] } })),
        fc.integer({ min: 0, max: 5 }).map((n) => ({ tags: { $size: n } })),
        tagVal.map((t) => ({ tags: { $elemMatch: { $eq: t } } }))
    );
}

function profileMetaRankLeafArb() {
    const n = fc.integer({ min: 0, max: 120 });
    const pool = fc.uniqueArray(n, { minLength: 1, maxLength: 5 });
    return fc.oneof(
        n.map((x) => ({ "profile.meta.rank": x })),
        n.map((x) => ({ "profile.meta.rank": { $eq: x } })),
        n.map((x) => ({ "profile.meta.rank": { $gte: x } })),
        pool.map((arr) => ({ "profile.meta.rank": { $in: arr } })),
        fc.boolean().map((b) => ({ "profile.meta.rank": { $exists: b } }))
    );
}

function profileMetaRegionCodeLeafArb() {
    const v = fc.constantFrom("eu", "us", "ap", "xx", null);
    return fc.oneof(
        v.map((x) => ({ "profile.meta.region.code": x })),
        v.map((x) => ({ "profile.meta.region.code": { $eq: x } })),
        fc.subarray(["eu", "us", "ap", "xx", null], { minLength: 1, maxLength: 4 }).map((arr) => ({
            "profile.meta.region.code": { $in: [...arr] },
        })),
        fc.boolean().map((b) => ({ "profile.meta.region.code": { $exists: b } }))
    );
}

/** 同字段在 $and 中拆成多条（由 normalize 合并），语义须与 Mongo 一致 */
function sameFieldSplitAndArb() {
    return fc.oneof(
        fc.tuple(fc.integer({ min: -50, max: 50 }), fc.integer({ min: -50, max: 50 })).map(([a, b]) => ({
            $and: [{ score: { $gte: a } }, { score: { $lte: b } }],
        })),
        fc.tuple(fc.integer({ min: 0, max: 80 }), fc.integer({ min: 0, max: 80 })).map(([a, b]) => ({
            $and: [{ "profile.level": { $gt: a } }, { "profile.level": { $lt: b } }],
        })),
        fc.tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 })).map(([x, y]) => ({
            $and: [{ score: x }, { score: { $ne: y } }],
        }))
    );
}

/**
 * 路径重叠：`profile` 子文档与点路径并存在同一 $and 中。
 */
function pathConflictPredicateArb() {
    return fc.oneof(
        fc
            .tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 20 }), fc.constantFrom(...REGION_POOL))
            .map(([l1, l2, r]) => ({
                $and: [{ profile: { level: l1, region: r } }, { "profile.level": l2 }],
            })),
        fc
            .tuple(fc.integer({ min: 0, max: 20 }), fc.constantFrom(...REGION_POOL))
            .map(([lvl, r]) => ({
                $and: [{ profile: { level: lvl } }, { "profile.region": r }],
            })),
        fc
            .tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }))
            .map(([r1, r2]) => ({
                $and: [{ "profile.meta.rank": { $gte: r1 } }, { "profile.meta.rank": { $lte: r2 } }],
            })),
        fc
            .tuple(fc.constantFrom("eu", "us", "ap"), fc.integer({ min: 0, max: 15 }))
            .map(([code, lvl]) => ({
                $and: [{ "profile.meta.region.code": code }, { "profile.level": lvl }],
            }))
    );
}

/** 明显不可满足或冗余约束，用于压力合并与矛盾折叠 */
function boundaryPredicateArb() {
    return fc.oneof(
        fc.integer({ min: -100, max: 100 }).map((x) => ({ $and: [{ score: x }, { score: { $ne: x } }] })),
        fc.integer({ min: 0, max: 50 }).map((x) => ({
            $and: [{ score: { $lt: x } }, { score: { $gt: x } }],
        })),
        fc.constant({ $and: [{ archived: true }, { archived: false }] }),
        fc.tuple(leafPredicateArb(), leafPredicateArb()).map(([a, b]) => ({ $and: [a, b] }))
    );
}

function leafPredicateArbExtended() {
    return fc.oneof(
        leafPredicateArb(),
        tagsPredicateArb(),
        profileMetaRankLeafArb(),
        profileMetaRegionCodeLeafArb(),
        pathConflictPredicateArb(),
        sameFieldSplitAndArb()
    );
}

/**
 * 更深逻辑嵌套；偶发单元素 $and/$or、冗余 $and 包裹。
 */
function queryAtDepthExtended(d) {
    const leaf = fc.oneof(leafPredicateArbExtended(), boundaryPredicateArb());
    if (d <= 0) {
        return leaf;
    }
    const inner = queryAtDepthExtended(d - 1);
    const compoundBranch = fc.oneof(
        fc.array(inner, { minLength: 2, maxLength: 4 }).map((c) => ({ $and: c })),
        fc.array(inner, { minLength: 2, maxLength: 4 }).map((c) => ({ $or: c })),
        fc.array(inner, { minLength: 1, maxLength: 1 }).map((c) => ({ $and: c })),
        fc.array(inner, { minLength: 1, maxLength: 1 }).map((c) => ({ $or: c })),
        inner.map((q) => ({ $and: [{ $and: [q] }] }))
    );
    return fc.oneof(leaf, compoundBranch);
}

const queryArbExtended = queryAtDepthExtended(5);

const sortArbExtended = fc.oneof(
    sortArb,
    fc.constant({ score: 1, priority: 1, _id: 1 }),
    fc.constant({ score: -1, ownerId: 1, _id: 1 }),
    fc.constant({ createdAt: -1, score: 1, _id: 1 }),
    fc.constant({ priority: 1, createdAt: -1, _id: -1 }),
    fc.constant({ "profile.level": 1, score: -1, _id: 1 }),
    fc.constant({ "profile.level": -1, ownerId: 1, _id: 1 }),
    fc.constant({ archived: 1, score: -1, _id: 1 })
);

module.exports = {
    docArb,
    docArbRich,
    docsBatchArb,
    docsBatchArbRich,
    queryArb,
    queryArbExtended,
    queryAtDepthExtended,
    sortArb,
    sortArbExtended,
    skipArb,
    limitArb,
    getFcConfig,
    leafPredicateArb,
    leafPredicateArbExtended,
    tagsPredicateArb,
    pathConflictPredicateArb,
    sameFieldSplitAndArb,
    boundaryPredicateArb,
    DATE_MIN,
    DATE_MAX,
};
