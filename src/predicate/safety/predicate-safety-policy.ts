export type PredicateSafetyPolicy = {
    allowArraySensitiveRewrite: boolean;
    allowNullSemanticRewrite: boolean;
    allowExistsSemanticRewrite: boolean;
    allowPathConflictRewrite: boolean;
    bailoutOnUnsupportedMix: boolean;
};

export const DEFAULT_PREDICATE_SAFETY_POLICY: PredicateSafetyPolicy = {
    allowArraySensitiveRewrite: false,
    allowNullSemanticRewrite: false,
    allowExistsSemanticRewrite: false,
    allowPathConflictRewrite: false,
    bailoutOnUnsupportedMix: true,
};
