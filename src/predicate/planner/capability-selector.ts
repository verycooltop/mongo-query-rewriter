import type { PredicateCapability } from "../capabilities/shared/capability-types";
import type { RelationContext } from "../capabilities/shared/relation-context";

export function capabilitySupportsBundleKinds(cap: PredicateCapability, atomKinds: Set<string>): boolean {
    if (cap.supportedAtomKinds.length === 0) {
        return true;
    }
    return cap.supportedAtomKinds.some((k) => atomKinds.has(k));
}

export function collectAtomKindsFromBundle(predicates: { kind: string }[]): Set<string> {
    const kinds = new Set<string>();
    for (const p of predicates) {
        kinds.add(p.kind);
    }
    return kinds;
}

export function isCapabilityCandidate(cap: PredicateCapability, ctx: RelationContext): boolean {
    const kinds = collectAtomKindsFromBundle(ctx.bundle.predicates);
    return capabilitySupportsBundleKinds(cap, kinds);
}
