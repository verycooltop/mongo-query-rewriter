import { refreshBundleMetadata } from "../../ir/build-field-bundle";
import type { PredicateAtom } from "../../ir/predicate-atom";
import type { PredicateCapability } from "../shared/capability-types";
import type { RelationContext } from "../shared/relation-context";
import { emptyRelationResult, type RelationResult } from "../shared/relation-result";
import { uniqueUnknownArray } from "../../utils/set-ops";

function collectNinAtoms(predicates: PredicateAtom[]): Array<Extract<PredicateAtom, { kind: "nin" }>> {
    return predicates.filter((a): a is Extract<PredicateAtom, { kind: "nin" }> => a.kind === "nin");
}

export const ninNinCapability: PredicateCapability = {
    id: "nin.nin",
    description: "Merge multiple $nin on the same field into a single $nin (union of value lists)",
    riskLevel: "guarded",
    supportedAtomKinds: ["nin"],
    isApplicable(ctx: RelationContext): boolean {
        if (!ctx.engine.mergeComparable) {
            return false;
        }
        return collectNinAtoms(ctx.bundle.predicates).length >= 2;
    },
    apply(ctx: RelationContext): RelationResult {
        const base = emptyRelationResult(ctx.bundle);
        const ninAtoms = collectNinAtoms(ctx.bundle.predicates);
        if (ninAtoms.length < 2) {
            return base;
        }

        const unionValues = uniqueUnknownArray(ninAtoms.flatMap((a) => a.values));
        if (unionValues.length === 0) {
            // $nin: [] is a tautology (x not in []), but keep behavior conservative:
            // if input contains multiple $nin, replacing them with $nin: [] preserves conjunction semantics.
            // (Mongo treats $nin: [] as no restriction)
        }

        const others = ctx.bundle.predicates.filter((a) => a.kind !== "nin");
        const nextPredicates: PredicateAtom[] = [...others, { kind: "nin", values: unionValues }];

        return {
            bundle: refreshBundleMetadata({ ...ctx.bundle, predicates: nextPredicates }),
            changed: true,
            contradiction: false,
            coveredAtoms: ninAtoms,
            skippedAtoms: [],
            warnings: [],
        };
    },
};

