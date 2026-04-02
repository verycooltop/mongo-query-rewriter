import { refreshBundleMetadata } from "../../ir/build-field-bundle";
import type { PredicateAtom } from "../../ir/predicate-atom";
import type { PredicateCapability } from "../shared/capability-types";
import type { RelationContext } from "../shared/relation-context";
import { emptyRelationResult, type RelationResult } from "../shared/relation-result";
import { uniqueUnknownArray } from "../../utils/set-ops";

function collectNeAtoms(predicates: PredicateAtom[]): Array<Extract<PredicateAtom, { kind: "ne" }>> {
    return predicates.filter((a): a is Extract<PredicateAtom, { kind: "ne" }> => a.kind === "ne");
}

export const neNeCapability: PredicateCapability = {
    id: "ne.ne",
    description: "Merge multiple $ne on the same field into a single $nin",
    riskLevel: "guarded",
    supportedAtomKinds: ["ne"],
    isApplicable(ctx: RelationContext): boolean {
        if (!ctx.engine.mergeComparable) {
            return false;
        }

        return collectNeAtoms(ctx.bundle.predicates).length >= 2;
    },
    apply(ctx: RelationContext): RelationResult {
        const base = emptyRelationResult(ctx.bundle);
        const neAtoms = collectNeAtoms(ctx.bundle.predicates);
        if (neAtoms.length < 2) {
            return base;
        }

        const uniqNeValues = uniqueUnknownArray(neAtoms.map((a) => a.value));
        if (uniqNeValues.length < 2) {
            // Should normally be handled by upstream dedupe, but keep it robust.
            return base;
        }

        const others = ctx.bundle.predicates.filter((a) => a.kind !== "ne");
        const nextPredicates: PredicateAtom[] = [...others, { kind: "nin", values: uniqNeValues }];

        return {
            bundle: refreshBundleMetadata({ ...ctx.bundle, predicates: nextPredicates }),
            changed: true,
            contradiction: false,
            coveredAtoms: neAtoms,
            skippedAtoms: [],
            warnings: [],
        };
    },
};

