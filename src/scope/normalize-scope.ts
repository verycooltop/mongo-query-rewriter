import { andNode } from "../ast/builders";
import { isFieldNode, isLogicalNode } from "../ast/guards";
import type { LogicalNode, QueryNode } from "../ast/types";
import type { NormalizeContext } from "../normalize-context";
import type { ScopeTraceEvent } from "../types";
import { constraintSetFromQueryNode } from "./context/build-inherited-constraints";
import {
    cloneConstraintSet,
    emptyConstraintSet,
    type ConstraintExtractionRejection,
    type ConstraintSet,
} from "./context/constraint-set";
import { mergeConstraintSources, mergeManyConstraintSources } from "./context/merge-constraint-sources";
import { collapseOrNodeChildren } from "./rewrite/collapse-single-branch";
import { pruneImpossibleOrBranch } from "./rewrite/prune-impossible-branches";
import { removeCoveredLocalConstraints } from "./rewrite/remove-covered-local-constraints";
import type { ScopeSafetyPolicy } from "./safety/scope-safety-policy";

type EmitScopeTrace = (event: ScopeTraceEvent) => void;

/** Extract positive field constraints from one $and sibling subtree (constraint-set build only; no context I/O). */
function positiveFieldConstraintsFromSibling(child: QueryNode): ConstraintSet {
    if (isFieldNode(child)) {
        return constraintSetFromQueryNode(child);
    }
    if (isLogicalNode(child) && child.op === "$and") {
        const parts = child.children.map((c) => positiveFieldConstraintsFromSibling(c));
        return mergeManyConstraintSources(parts);
    }
    return emptyConstraintSet();
}

/** Orchestrator-only: append inherited-phase extraction rejections to observe metadata (same guard as legacy per-sibling record). */
function commitInheritedConstraintRejections(
    normalizeContext: NormalizeContext,
    rejections: readonly ConstraintExtractionRejection[]
): void {
    if (!normalizeContext.options.observe.collectScopeTraces || rejections.length === 0) {
        return;
    }
    if (!normalizeContext.scopeConstraintRejections) {
        normalizeContext.scopeConstraintRejections = [];
    }
    normalizeContext.scopeConstraintRejections.push(...rejections);
}

type BuiltInheritedForAndChild = {
    inheritedConstraints: ConstraintSet;
    /** Per-sibling extraction rejections in sibling loop order (excludes inherited set’s own rejections). */
    rejections: ConstraintExtractionRejection[];
};

/** Pure build: merge sibling constraints into inherited; rejections are reported separately for orchestrator commit. */
function buildInheritedConstraintsForAndChild(
    andLogical: LogicalNode & { op: "$and" },
    childIndex: number,
    inherited: ConstraintSet
): BuiltInheritedForAndChild {
    let siblingInherited = cloneConstraintSet(inherited);
    const rejections: ConstraintExtractionRejection[] = [];
    for (let j = 0; j < andLogical.children.length; j += 1) {
        if (j === childIndex) {
            continue;
        }
        const siblingPart = positiveFieldConstraintsFromSibling(andLogical.children[j]);
        rejections.push(...siblingPart.metadata.extractionRejections);
        siblingInherited = mergeConstraintSources(siblingInherited, siblingPart);
    }
    return { inheritedConstraints: siblingInherited, rejections };
}

/** Coverage elimination phase: delegate to rewriter; trace via emitTrace only. */
function applyCoverageElimination(
    branch: QueryNode,
    inherited: ConstraintSet,
    policy: ScopeSafetyPolicy,
    emitTrace: EmitScopeTrace
): QueryNode {
    return removeCoveredLocalConstraints(branch, inherited, policy, emitTrace);
}

/** Impossible-branch prune phase: delegate to rewriter; trace via emitTrace only. */
function applyImpossibleBranchPrune(
    branch: QueryNode,
    inherited: ConstraintSet,
    policy: ScopeSafetyPolicy,
    emitTrace: EmitScopeTrace
): QueryNode | null {
    return pruneImpossibleOrBranch(branch, inherited, policy, emitTrace);
}

/** $and child pass: recurse with sibling-merged inherited, then optional coverage pass. */
function normalizeAndChildWithInherited(
    child: QueryNode,
    siblingInherited: ConstraintSet,
    policy: ScopeSafetyPolicy,
    normalizeContext: NormalizeContext,
    emitTrace: EmitScopeTrace
): QueryNode {
    let processed = normalizeScopeRecursive(child, siblingInherited, policy, normalizeContext, emitTrace);
    if (!siblingInherited.metadata.hasUnsupportedSemantics) {
        processed = applyCoverageElimination(processed, siblingInherited, policy, emitTrace);
    }
    return processed;
}

/** $or branch pass: recurse, coverage elimination, then impossible-branch prune. */
function normalizeOrBranchWithInherited(
    child: QueryNode,
    inherited: ConstraintSet,
    policy: ScopeSafetyPolicy,
    normalizeContext: NormalizeContext,
    emitTrace: EmitScopeTrace
): QueryNode {
    let branch = normalizeScopeRecursive(child, inherited, policy, normalizeContext, emitTrace);
    branch = applyCoverageElimination(branch, inherited, policy, emitTrace);
    const prunedReplacement = applyImpossibleBranchPrune(branch, inherited, policy, emitTrace);
    if (prunedReplacement !== null) {
        return prunedReplacement;
    }
    return branch;
}

/** Post-$or children: structural collapse; collapse-or trace goes through emitTrace (already gated). */
function finalizeOrNode(
    newChildren: QueryNode[],
    policy: ScopeSafetyPolicy,
    emitTrace: EmitScopeTrace
): QueryNode {
    const childCountBeforeCollapse = newChildren.length;
    const out = collapseOrNodeChildren(newChildren, policy);
    if (policy.allowSingleBranchCollapse && childCountBeforeCollapse === 1) {
        emitTrace({
            type: "collapse-or",
            outcome: "collapsed-single-child",
            detail: "single $or branch collapsed",
        });
    }
    return out;
}

function normalizeScopeRecursive(
    node: QueryNode,
    inherited: ConstraintSet,
    policy: ScopeSafetyPolicy,
    normalizeContext: NormalizeContext,
    emitTrace: EmitScopeTrace
): QueryNode {
    if (isFieldNode(node)) {
        return node;
    }

    if (!isLogicalNode(node)) {
        return node;
    }

    if (node.op === "$and") {
        if (!policy.allowAndPropagation) {
            emitTrace({
                type: "and-propagation",
                outcome: "skipped-by-policy",
                detail: "$and sibling constraint propagation disabled by scope safety policy",
            });
            return andNode(
                node.children.map((c) => normalizeScopeRecursive(c, inherited, policy, normalizeContext, emitTrace))
            );
        }

        emitTrace({
            type: "and-propagation",
            outcome: "applied",
            detail: "merging sibling field constraints for $and children",
        });

        const newChildren: QueryNode[] = [];

        const andNodeTyped = node as LogicalNode & { op: "$and" };
        for (let i = 0; i < andNodeTyped.children.length; i += 1) {
            const { inheritedConstraints, rejections } = buildInheritedConstraintsForAndChild(
                andNodeTyped,
                i,
                inherited
            );
            commitInheritedConstraintRejections(normalizeContext, rejections);
            const processed = normalizeAndChildWithInherited(
                andNodeTyped.children[i],
                inheritedConstraints,
                policy,
                normalizeContext,
                emitTrace
            );
            newChildren.push(processed);
        }

        return andNode(newChildren);
    }

    if (node.op === "$or") {
        if (!policy.allowOrPropagation) {
            emitTrace({
                type: "or-branch-inherited",
                satisfiabilityCheck: "skipped",
                detail: "$or propagation disabled; inherited constraints not applied for branch analysis",
            });
            const lifted = node.children.map((c) =>
                normalizeScopeRecursive(c, inherited, policy, normalizeContext, emitTrace)
            );
            return finalizeOrNode(lifted, policy, emitTrace);
        }

        const newChildren: QueryNode[] = [];
        for (const child of node.children) {
            const branch = normalizeOrBranchWithInherited(child, inherited, policy, normalizeContext, emitTrace);
            newChildren.push(branch);
        }

        return finalizeOrNode(newChildren, policy, emitTrace);
    }

    return node;
}

export function normalizeScope(node: QueryNode, normalizeContext: NormalizeContext): QueryNode {
    const policy = normalizeContext.options.scope.safetyPolicy;
    const emitTrace = (event: ScopeTraceEvent): void => {
        if (!normalizeContext.options.observe.collectScopeTraces) {
            return;
        }
        if (!normalizeContext.scopeTraceEvents) {
            normalizeContext.scopeTraceEvents = [];
        }
        normalizeContext.scopeTraceEvents.push(event);
    };
    return normalizeScopeRecursive(node, emptyConstraintSet(), policy, normalizeContext, emitTrace);
}
