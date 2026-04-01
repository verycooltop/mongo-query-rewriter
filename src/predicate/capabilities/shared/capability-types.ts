import type { RelationContext } from "./relation-context";
import type { RelationResult } from "./relation-result";

export type PredicateCapability = {
    id: string;
    description: string;
    riskLevel: "safe" | "guarded" | "provisional";
    supportedAtomKinds: string[];
    isApplicable: (ctx: RelationContext) => boolean;
    apply: (ctx: RelationContext) => RelationResult;
};
