"use strict";

/** @type {import("../../dist/index.js").NormalizeLevel[]} */
const LEVELS = ["shape", "predicate", "scope"];

/**
 * @param {(level: import("../../dist/index.js").NormalizeLevel) => void} register
 */
function forEachLevel(register) {
    for (const level of LEVELS) {
        register(level);
    }
}

module.exports = { LEVELS, forEachLevel };
