export type ScopeNormalizeMeta = {
    scopePassRan: boolean;
};

export function emptyScopeMeta(): ScopeNormalizeMeta {
    return { scopePassRan: false };
}
