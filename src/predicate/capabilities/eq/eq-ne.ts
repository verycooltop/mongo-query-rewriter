import type { PredicateCapability } from "../shared/capability-types";
import type { RelationContext } from "../shared/relation-context";
import { emptyRelationResult, type RelationResult } from "../shared/relation-result";
import { valuesEqual } from "../../utils/value-equality";

export const eqNeCapability: PredicateCapability = {
    id: "eq.ne",
    description: "Detect $eq vs $ne on the same value",
    riskLevel: "safe",
    supportedAtomKinds: ["eq", "ne"],
    isApplicable(ctx: RelationContext): boolean {
        if (!ctx.engine.collapseContradictions) {
            return false;
        }
        const hasEq = ctx.bundle.predicates.some((a) => a.kind === "eq");
        const hasNe = ctx.bundle.predicates.some((a) => a.kind === "ne");
        return hasEq && hasNe;
    },
    apply(ctx: RelationContext): RelationResult {
        const base = emptyRelationResult(ctx.bundle);
        const eq = ctx.bundle.predicates.find((a) => a.kind === "eq");
        if (!eq || eq.kind !== "eq") {
            return base;
        }

        for (const atom of ctx.bundle.predicates) {
            if (atom.kind === "ne" && valuesEqual(eq.value, atom.value)) {
                return {
                    ...base,
                    contradiction: true,
                    changed: true,
                };
            }
        }

        return base;
    },
};
