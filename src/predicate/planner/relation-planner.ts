import type { PredicateCapability } from "../capabilities/shared/capability-types";
import type { RelationContext } from "../capabilities/shared/relation-context";
import { detectUnsupportedMix } from "../ir/build-field-bundle";
import type { RelationPlan, SkippedCapability } from "./relation-plan";
import { isCapabilityCandidate } from "./capability-selector";

const DEFAULT_CAPABILITY_ORDER: string[] = ["eq.eq", "eq.ne", "ne.ne", "nin.nin", "eq.in", "range.range", "eq.range"];

function orderCapabilities(caps: PredicateCapability[]): PredicateCapability[] {
    const byId = new Map(caps.map((c) => [c.id, c] as const));
    const ordered: PredicateCapability[] = [];
    for (const id of DEFAULT_CAPABILITY_ORDER) {
        const cap = byId.get(id);
        if (cap) {
            ordered.push(cap);
        }
    }
    for (const cap of caps) {
        if (!DEFAULT_CAPABILITY_ORDER.includes(cap.id)) {
            ordered.push(cap);
        }
    }
    return ordered;
}

export function planRelations(orderedCapabilities: PredicateCapability[], ctx: RelationContext): RelationPlan {
    const skippedCapabilities: SkippedCapability[] = [];

    if (ctx.safety.bailoutOnUnsupportedMix && detectUnsupportedMix(ctx.bundle)) {
        for (const cap of orderedCapabilities) {
            skippedCapabilities.push({
                id: cap.id,
                reason: "unsupported opaque mix in bundle",
            });
        }
        return { capabilities: [], skippedCapabilities };
    }

    const ordered = orderCapabilities(orderedCapabilities);
    const selected: PredicateCapability[] = [];

    for (const cap of ordered) {
        if (!isCapabilityCandidate(cap, ctx)) {
            skippedCapabilities.push({
                id: cap.id,
                reason: "no supporting atom kinds in bundle",
            });
            continue;
        }

        if (cap.id === "eq.in" && ctx.bundle.metadata.hasArraySensitiveSemantics && !ctx.safety.allowArraySensitiveRewrite) {
            skippedCapabilities.push({
                id: cap.id,
                reason: "array-sensitive rewrite disabled",
            });
            continue;
        }

        if (cap.id === "eq.in" && ctx.bundle.metadata.hasNullSemantics && !ctx.safety.allowNullSemanticRewrite) {
            skippedCapabilities.push({
                id: cap.id,
                reason: "null semantic rewrite disabled",
            });
            continue;
        }

        selected.push(cap);
    }

    return { capabilities: selected, skippedCapabilities };
}
