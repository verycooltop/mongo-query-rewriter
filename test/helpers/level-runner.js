"use strict";

const { normalizeQuery } = require("../../dist/index.js");

/** @param {import("../../dist/index.js").NormalizeLevel} level */
function runAtLevel(level, query, options = {}) {
    return normalizeQuery(query, { ...options, level });
}

module.exports = { runAtLevel };
