"use strict";

/**
 * Differential Testing：使用 mongodb-memory-server 验证 find(query) === find(rewrite(query))。
 */
const assert = require("node:assert/strict");
const { fc, differentialSelectorArb } = require("../helpers/arbitraries.js");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { MongoClient } = require("mongodb");

const { rewriteQuerySelector } = require("../../dist/index.js");

function randomRichDocs(count) {
    const docs = [];
    for (let i = 0; i < count; i++) {
        const base = {};

        // 数值字段：有的存在，有的缺失，取值范围稍大
        if (Math.random() < 0.8) {
            base.a = Math.floor(Math.random() * 20) - 5;
        }
        if (Math.random() < 0.8) {
            base.b = Math.floor(Math.random() * 20) - 5;
        }
        if (Math.random() < 0.6) {
            base.c = Math.floor(Math.random() * 20) - 5;
        }

        // 布尔 / null
        if (Math.random() < 0.5) {
            base.flag = Math.random() < 0.5;
        } else if (Math.random() < 0.3) {
            base.flag = null;
        }

        // 字符串 + 小数组字段，便于 $in / $nin 命中
        if (Math.random() < 0.7) {
            const tagPool = ["red", "green", "blue", "hot", "cold", "large", "small"];
            const tagCount = 1 + Math.floor(Math.random() * 3);
            const tags = [];
            for (let j = 0; j < tagCount; j++) {
                const tag = tagPool[Math.floor(Math.random() * tagPool.length)];
                if (!tags.includes(tag)) {
                    tags.push(tag);
                }
            }
            base.tags = tags;
        }

        // 简单嵌套对象，验证点路径场景
        if (Math.random() < 0.6) {
            base.meta = {
                score: Math.floor(Math.random() * 100),
                level: Math.random() < 0.5 ? "gold" : "silver",
            };
        }

        docs.push(base);
    }
    return docs;
}

describe("differential: mongodb-memory-server", () => {
    let mongod;
    let client;
    let db;
    let coll;

    before(async function () {
        this.timeout(30000);
        try {
            mongod = await MongoMemoryServer.create();
            const uri = mongod.getUri();
            client = await MongoClient.connect(uri, {});
            db = client.db("test-db");

            // 在测试开始时创建一批“足量且结构多样”的文档，并建索引
            coll = db.collection("diff_coll");
            await coll.deleteMany({});
            await coll.insertMany(randomRichDocs(2000));
            await coll.createIndex({ a: 1, b: 1 });
            await coll.createIndex({ c: 1 });
            await coll.createIndex({ "meta.score": -1 });
            await coll.createIndex({ "meta.level": 1 });
            await coll.createIndex({ tags: 1 });
        } catch (err) {
            // 在受限环境（如沙箱）下可能无法下载 mongod 二进制，此时跳过整个差异测试套件
            // 本地/CI 正常环境仍会运行完整 differential tests。
            // eslint-disable-next-line no-console
            console.warn("[differential.test] skip due to MongoMemoryServer error:", err && err.message);
            this.skip();
        }
    });

    after(async function () {
        this.timeout(30000);
        if (client) {
            await client.close();
        }
        if (mongod) {
            await mongod.stop();
        }
    });

    it("随机 selector：find(query) 与 find(rewrite(query)) 结果一致", async function () {
        this.timeout(40000);

        const runs = 200;

        for (let i = 0; i < runs; i++) {
            const selector = fc.sample(differentialSelectorArb(3), 1)[0];
            const rewritten = rewriteQuerySelector(selector);

            const resultQuery = await coll.find(selector).toArray();
            const resultOpt = await coll.find(rewritten).toArray();

            // 只比对 _id，以 Set 形式判等，避免顺序差异
            const toIdSet = (arr) => {
                const s = new Set();
                for (let i2 = 0; i2 < arr.length; i2++) {
                    s.add(String(arr[i2]._id));
                }
                return s;
            };
            const idsQuery = toIdSet(resultQuery);
            const idsOpt = toIdSet(resultOpt);
            if (idsQuery.size !== idsOpt.size || [...idsQuery].some((id) => !idsOpt.has(id))) {
                assert.fail(`selector = ${JSON.stringify(selector)}, rewritten = ${JSON.stringify(rewritten)}`);
            }
        }
    });

    it("ObjectId 相关查询在 rewrite 前后结果一致", async function () {
        this.timeout(10000);

        const docs = await coll.find({}).limit(3).toArray();
        assert.ok(docs.length >= 3, "需要至少 3 条文档用于 ObjectId 测试");

        const [doc1, doc2, doc3] = docs;
        const id1 = doc1._id;
        const id2 = doc2._id;
        const id3 = doc3._id;

        const id1Hex = id1.toHexString();
        const id3Hex = id3.toHexString();

        const selectors = [
            { _id: id1 },
            { _id: { $in: [id1, id2] } },
            { _id: { $in: [id1, id1Hex] } },
            { _id: { $nin: [id3, id3Hex] } },
        ];

        for (const selector of selectors) {
            const rewritten = rewriteQuerySelector(selector);

            const resultQuery = await coll.find(selector).toArray();
            const resultOpt = await coll.find(rewritten).toArray();

            const toIdSet = (arr) => {
                const s = new Set();
                for (let i2 = 0; i2 < arr.length; i2++) {
                    s.add(String(arr[i2]._id));
                }
                return s;
            };
            const idsQuery = toIdSet(resultQuery);
            const idsOpt = toIdSet(resultOpt);
            if (idsQuery.size !== idsOpt.size || [...idsQuery].some((id) => !idsOpt.has(id))) {
                assert.fail(`selector = ${JSON.stringify(selector)}, rewritten = ${JSON.stringify(rewritten)}`);
            }
        }
    });

    it("未建模字段操作符透传：find 与 find(rewrite) 的 _id 集合一致", async function () {
        this.timeout(10000);
        const preservedSelectors = [
            { tags: { $size: 1 } },
            { tags: { $all: ["red"] } },
            { a: { $mod: [2, 0] } },
            { a: { $type: "number" } },
        ];
        for (const selector of preservedSelectors) {
            const rewritten = rewriteQuerySelector(selector);
            const resultQuery = await coll.find(selector).toArray();
            const resultOpt = await coll.find(rewritten).toArray();
            const toIdSet = (arr) => {
                const s = new Set();
                for (let i2 = 0; i2 < arr.length; i2++) {
                    s.add(String(arr[i2]._id));
                }
                return s;
            };
            const idsQuery = toIdSet(resultQuery);
            const idsOpt = toIdSet(resultOpt);
            if (idsQuery.size !== idsOpt.size || [...idsQuery].some((id) => !idsOpt.has(id))) {
                assert.fail(`selector = ${JSON.stringify(selector)}, rewritten = ${JSON.stringify(rewritten)}`);
            }
        }
    });
});

