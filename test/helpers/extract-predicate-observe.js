"use strict";

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function extractAppliedCapabilities(meta) {
    const traces = asArray(meta && meta.predicateTraces);
    const capabilityIds = new Set();
    for (const trace of traces) {
        for (const capabilityId of asArray(trace && trace.appliedCapabilityIds)) {
            if (typeof capabilityId === "string" && capabilityId.length > 0) {
                capabilityIds.add(capabilityId);
            }
        }
    }
    return [...capabilityIds];
}

function extractSkippedCapabilities(meta) {
    const traces = asArray(meta && meta.predicateTraces);
    const skippedCapabilityIds = new Set();
    for (const trace of traces) {
        for (const skippedCapability of asArray(trace && trace.skippedCapabilities)) {
            if (skippedCapability && typeof skippedCapability.id === "string" && skippedCapability.id.length > 0) {
                skippedCapabilityIds.add(skippedCapability.id);
            }
        }
    }
    return [...skippedCapabilityIds];
}

function extractWarnings(meta) {
    return asArray(meta && meta.warnings).filter((warning) => typeof warning === "string");
}

module.exports = {
    extractAppliedCapabilities,
    extractSkippedCapabilities,
    extractWarnings,
};
