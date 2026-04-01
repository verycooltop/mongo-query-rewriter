"use strict";

const assert = require("node:assert/strict");
const { ObjectId } = require("mongodb");
const { getTestCollection, clearTestCollection } = require("../helpers/mongo-fixture.js");
const { IMPOSSIBLE_SELECTOR } = require("../../dist/types.js");

describe("semantic / IMPOSSIBLE_SELECTOR 空集", function () {
    this.timeout(60000);

    it("countDocuments 为 0（常规插入文档）", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        await coll.insertOne({ _id: new ObjectId(), x: 1 });
        const n = await coll.countDocuments(IMPOSSIBLE_SELECTOR);
        assert.equal(n, 0);
    });
});
