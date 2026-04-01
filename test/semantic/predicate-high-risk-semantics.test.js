"use strict";

const assert = require("node:assert/strict");
const { getTestCollection, clearTestCollection } = require("../helpers/mongo-fixture.js");
const { runFindIds } = require("../helpers/query-runner.js");
const {
    normalizePredicateCase,
    assertAppliedCapabilitiesWhitelisted,
} = require("../helpers/predicate-test-helpers.js");

describe("semantic / predicate high risk semantics", function () {
    this.timeout(120000);

    beforeEach(async () => {
        const collection = getTestCollection();
        await clearTestCollection();
        await collection.insertMany([
            { _id: "missing" },
            { _id: "null", a: null },
            { _id: "one", a: 1 },
            { _id: "two", a: 2 },
            { _id: "array12", a: [1, 2] },
            { _id: "emptyArray", a: [] },
            { _id: "objB1", a: { b: 1 } },
            { _id: "objBC", a: { b: 2, c: 3 } },
            { _id: "arrayObj", a: [{ b: 1 }] },
            { _id: "objArray", a: { b: [1, 2] } },
        ]);
    });

    async function assertSemanticEquivalent(query) {
        const normalizedResult = normalizePredicateCase(query);
        assertAppliedCapabilitiesWhitelisted(normalizedResult.meta);

        const collection = getTestCollection();
        const findOptions = { sort: { _id: 1 }, skip: 0, limit: 1000 };
        const originalIds = await runFindIds(collection, query, findOptions);
        const normalizedIds = await runFindIds(collection, normalizedResult.normalized, findOptions);
        assert.deepStrictEqual(normalizedIds, originalIds);

        const secondPass = normalizePredicateCase(normalizedResult.normalized);
        assert.deepStrictEqual(secondPass.normalized, normalizedResult.normalized);
    }

    describe("missing vs null", () => {
        it("$exists:false + null", async () => {
            await assertSemanticEquivalent({ $and: [{ a: { $exists: false } }, { a: null }] });
        });

        it("$exists:false + ne:null", async () => {
            await assertSemanticEquivalent({ $and: [{ a: { $exists: false } }, { a: { $ne: null } }] });
        });

        it("null + in[null,1]", async () => {
            await assertSemanticEquivalent({ $and: [{ a: null }, { a: { $in: [null, 1] } }] });
        });
    });

    describe("scalar vs array", () => {
        it("eq + in", async () => {
            await assertSemanticEquivalent({ $and: [{ a: 1 }, { a: { $in: [1, 2] } }] });
        });

        it("in + range", async () => {
            await assertSemanticEquivalent({ $and: [{ a: { $in: [1, 2] } }, { a: { $gt: 0 } }] });
        });

        it("$nin + eq", async () => {
            await assertSemanticEquivalent({ $and: [{ a: { $nin: [2] } }, { a: 1 }] });
        });
    });

    describe("whole-object vs dotted-path", () => {
        it("whole-object + dotted path same branch", async () => {
            await assertSemanticEquivalent({ $and: [{ a: { b: 1 } }, { "a.b": 1 }] });
        });

        it("null + dotted path", async () => {
            await assertSemanticEquivalent({ $and: [{ a: null }, { "a.b": 1 }] });
        });

        it("whole-object + sibling dotted path", async () => {
            await assertSemanticEquivalent({ $and: [{ a: { b: 1 } }, { "a.c": 2 }] });
        });
    });

    describe("opaque + supported mix", () => {
        it("$regex + eq", async () => {
            await assertSemanticEquivalent({ $and: [{ a: { $regex: "^1" } }, { a: 1 }] });
        });

        it("$elemMatch + in", async () => {
            await assertSemanticEquivalent({ $and: [{ a: { $elemMatch: { b: 1 } } }, { a: { $in: [1, 2] } }] });
        });
    });
});
