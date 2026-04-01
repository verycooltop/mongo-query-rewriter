import type { FieldPredicateBundle } from "../ir/field-predicate-bundle";

export function detectOpaqueMix(bundle: FieldPredicateBundle): boolean {
    const hasOpaqueAtom = bundle.predicates.some((a) => a.kind === "opaque");
    const hasNonOpaqueAtom = bundle.predicates.some((a) => a.kind !== "opaque");
    return hasOpaqueAtom && hasNonOpaqueAtom;
}
