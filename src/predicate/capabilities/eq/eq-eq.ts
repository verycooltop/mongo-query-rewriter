import { refreshBundleMetadata } from "../../ir/build-field-bundle";
import type { PredicateAtom } from "../../ir/predicate-atom";
import type { PredicateCapability } from "../shared/capability-types";
import type { RelationContext } from "../shared/relation-context";
import { emptyRelationResult, type RelationResult } from "../shared/relation-result";
import { valuesEqual } from "../../utils/value-equality";

function collectEqAtoms(predicates: PredicateAtom[]): Extract<PredicateAtom, { kind: "eq" }>[] {
    return predicates.filter((a): a is Extract<PredicateAtom, { kind: "eq" }> => a.kind === "eq");
}

export const eqEqCapability: PredicateCapability = {
    id: "eq.eq",
    description: "Merge duplicate $eq and detect conflicting $eq on the same field",
    riskLevel: "safe",
    supportedAtomKinds: ["eq"],
    isApplicable(ctx: RelationContext): boolean {
        if (!ctx.engine.mergeComparable) {
            return false;
        }
        return collectEqAtoms(ctx.bundle.predicates).length >= 2;
    },
    apply(ctx: RelationContext): RelationResult {
        const base = emptyRelationResult(ctx.bundle);
        const eqs = collectEqAtoms(ctx.bundle.predicates);
        if (eqs.length < 2) {
            return base;
        }

        const first = eqs[0];
        for (let i = 1; i < eqs.length; i += 1) {
            if (!valuesEqual(first.value, eqs[i].value)) {
                return {
                    ...base,
                    contradiction: true,
                    changed: true,
                };
            }
        }

        const rest = ctx.bundle.predicates.filter((a) => a.kind !== "eq");
        const covered = eqs.slice(1);
        const next = refreshBundleMetadata({
            ...ctx.bundle,
            predicates: [first, ...rest],
        });

        return {
            bundle: next,
            changed: true,
            contradiction: false,
            coveredAtoms: covered,
            skippedAtoms: [],
            warnings: [],
        };
    },
};
