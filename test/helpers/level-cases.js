"use strict";

const { IMPOSSIBLE_SELECTOR } = require("../../dist/types.js");

const contradictorySameFieldInAnd = { $and: [{ a: 1 }, { a: 2 }] };

const duplicateLogicalChildren = { $and: [{ a: 1 }, { a: 1 }] };

const duplicateOrBranches = { $or: [{ a: 1 }, { a: 1 }] };

const singleChildAnd = { $and: [{ a: 1 }] };

const singleChildOr = { $or: [{ a: 1 }] };

const nestedAndFlatten = { $and: [{ $and: [{ a: 1 }, { b: 2 }] }] };

const andWrappingOr = { $and: [{ $or: [{ a: 1 }, { b: 2 }] }] };

const comparableGtMerge = { $and: [{ a: { $gt: 1 } }, { a: { $gt: 5 } }] };

const inOverlapMerge = { $and: [{ a: { $in: [1, 2, 3] } }, { a: { $in: [2, 3, 4] } }] };

const literalAndExplicitEq = { $and: [{ a: 1 }, { a: { $eq: 1 } }] };

const multipleNeMergeToNin = { $and: [{ a: { $ne: 1 } }, { a: { $ne: 2 } }] };

const multipleNinMergeToNin = {
    $and: [{ a: { $nin: [1] } }, { a: { $nin: [2] } }, { a: { $nin: [2] } }],
};

const mixedNeAndNinMergeToNin = {
    $and: [{ a: { $ne: 1 } }, { a: { $nin: [2] } }, { a: { $ne: 3 } }],
};

const commonPredicatesInOr = {
    $or: [{ $and: [{ a: 1 }, { b: 1 }] }, { $and: [{ a: 1 }, { c: 1 }] }],
};

const commonPredicatesInOrTriple = {
    $or: [
        { $and: [{ a: 1 }, { b: 1 }] },
        { $and: [{ a: 1 }, { c: 1 }] },
        { $and: [{ a: 1 }, { d: 1 }] },
    ],
};

module.exports = {
    IMPOSSIBLE_SELECTOR,
    contradictorySameFieldInAnd,
    duplicateLogicalChildren,
    duplicateOrBranches,
    singleChildAnd,
    singleChildOr,
    nestedAndFlatten,
    andWrappingOr,
    comparableGtMerge,
    inOverlapMerge,
    literalAndExplicitEq,
    multipleNeMergeToNin,
    multipleNinMergeToNin,
    mixedNeAndNinMergeToNin,
    commonPredicatesInOr,
    commonPredicatesInOrTriple,
};
