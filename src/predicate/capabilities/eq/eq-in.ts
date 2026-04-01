import { refreshBundleMetadata } from "../../ir/build-field-bundle";
import type { PredicateAtom } from "../../ir/predicate-atom";
import type { PredicateCapability } from "../shared/capability-types";
import type { RelationContext } from "../shared/relation-context";
import { emptyRelationResult, type RelationResult } from "../shared/relation-result";
import { intersectInAtomValues } from "../../utils/intersect-in-lists";
import { uniqueUnknownArray } from "../../utils/set-ops";
import { valuesEqual } from "../../utils/value-equality";

function normalizeInAtoms(predicates: PredicateAtom[]): { next: PredicateAtom[]; changed: boolean } {
    let changed = false;
    const next: PredicateAtom[] = [];
    for (const atom of predicates) {
        if (atom.kind === "in") {
            const uniq = uniqueUnknownArray(atom.values);
            if (uniq.length !== atom.values.length) {
                changed = true;
                next.push({ kind: "in", values: uniq });
            } else {
                next.push(atom);
            }
        } else {
            next.push(atom);
        }
    }
    return { next, changed };
}

export const eqInCapability: PredicateCapability = {
    id: "eq.in",
    description: "Intersect $in lists; require $eq ∈ $in or fold contradiction; drop redundant $in under $eq",
    riskLevel: "guarded",
    supportedAtomKinds: ["eq", "in"],
    isApplicable(ctx: RelationContext): boolean {
        const hasIn = ctx.bundle.predicates.some((a) => a.kind === "in");
        if (!hasIn) {
            return false;
        }
        const eq = ctx.bundle.predicates.find((a) => a.kind === "eq");
        const needsMerge = ctx.engine.mergeComparable;
        const needsCollapse = ctx.engine.collapseContradictions && Boolean(eq);
        if (!needsMerge && !needsCollapse) {
            return false;
        }
        if (ctx.bundle.metadata.hasArraySensitiveSemantics && !ctx.safety.allowArraySensitiveRewrite) {
            return false;
        }
        return true;
    },
    apply(ctx: RelationContext): RelationResult {
        const base = emptyRelationResult(ctx.bundle);
        let predicates = ctx.bundle.predicates;
        let changed = false;
        const coveredAtoms: PredicateAtom[] = [];

        if (ctx.engine.mergeComparable) {
            const normalized = normalizeInAtoms(predicates);
            predicates = normalized.next;
            changed = normalized.changed;
        }

        let ins = predicates.filter((a): a is Extract<PredicateAtom, { kind: "in" }> => a.kind === "in");

        if (ctx.engine.mergeComparable && ins.length >= 2) {
            const prevIns = [...ins];
            const intersected = intersectInAtomValues(ins);
            const uniq = uniqueUnknownArray(intersected);
            if (uniq.length === 0) {
                if (ctx.engine.collapseContradictions) {
                    return {
                        ...base,
                        bundle: refreshBundleMetadata({ ...ctx.bundle, predicates }),
                        contradiction: true,
                        changed: true,
                    };
                }
            } else {
                predicates = [...predicates.filter((a) => a.kind !== "in"), { kind: "in", values: uniq }];
                coveredAtoms.push(...prevIns);
                changed = true;
                ins = predicates.filter((a): a is Extract<PredicateAtom, { kind: "in" }> => a.kind === "in");
            }
        }

        const eq = predicates.find((a) => a.kind === "eq");

        if (ctx.engine.collapseContradictions && eq && eq.kind === "eq") {
            for (const inAtom of ins) {
                const found = inAtom.values.some((item) => valuesEqual(item, eq.value));
                if (!found) {
                    return {
                        ...base,
                        bundle: refreshBundleMetadata({ ...ctx.bundle, predicates }),
                        contradiction: true,
                        changed: true,
                    };
                }
            }
        }

        if (ctx.engine.mergeComparable && eq && eq.kind === "eq" && ins.length > 0) {
            const allInsRedundant = ins.every((inAtom) => inAtom.values.some((item) => valuesEqual(item, eq.value)));
            if (allInsRedundant) {
                coveredAtoms.push(...ins);
                predicates = predicates.filter((a) => a.kind !== "in");
                changed = true;
            }
        }

        if (!changed) {
            return base;
        }

        return {
            bundle: refreshBundleMetadata({ ...ctx.bundle, predicates }),
            changed: true,
            contradiction: false,
            coveredAtoms,
            skippedAtoms: [],
            warnings: [],
        };
    },
};
