import { trueNode } from "../../ast/builders";
import { isFieldNode } from "../../ast/guards";
import type { FieldNode, QueryNode } from "../../ast/types";
import type { ScopeTraceEvent } from "../../types";
import { valuesEqual } from "../../predicate/utils/value-equality";
import type { ConstraintSet } from "../context/constraint-set";
import type { ScopeSafetyPolicy } from "../safety/scope-safety-policy";

function isSingleEqField(node: FieldNode): { value: unknown } | null {
    if (node.predicates.length !== 1) {
        return null;
    }
    const p = node.predicates[0];
    if (p.op === "$eq" || (!p.opaque && p.op === "$eq")) {
        return { value: p.value };
    }
    return null;
}

export function removeCoveredLocalConstraints(
    branch: QueryNode,
    inherited: ConstraintSet,
    policy: ScopeSafetyPolicy,
    onTrace?: (event: ScopeTraceEvent) => void
): QueryNode {
    if (!policy.allowConstraintCoverageElimination) {
        onTrace?.({
            type: "coverage-removal",
            outcome: "unchanged",
            detail: "coverage elimination disabled by scope safety policy",
        });
        return branch;
    }
    if (policy.bailoutOnUnsupportedScopeMix && inherited.metadata.hasUnsupportedSemantics) {
        onTrace?.({
            type: "coverage-removal",
            outcome: "unchanged",
            detail: "preserve: inherited constraints flagged unsupported for scope mix bailout",
        });
        return branch;
    }
    if (!isFieldNode(branch)) {
        onTrace?.({
            type: "coverage-removal",
            outcome: "unchanged",
            detail: "not a field leaf; no single-field coverage strip",
        });
        return branch;
    }

    const inheritedAtoms = inherited.byField.get(branch.field) ?? [];
    const eqInherited = inheritedAtoms.find((a) => a.kind === "eq");
    if (!eqInherited || eqInherited.kind !== "eq") {
        onTrace?.({
            type: "coverage-removal",
            outcome: "unchanged",
            detail: "no inherited eq constraint on this field",
        });
        return branch;
    }

    const localEq = isSingleEqField(branch);
    if (!localEq) {
        onTrace?.({
            type: "coverage-removal",
            outcome: "unchanged",
            detail: "local field is not a single $eq; conservative preserve",
        });
        return branch;
    }

    if (!valuesEqual(eqInherited.value, localEq.value)) {
        onTrace?.({
            type: "coverage-removal",
            outcome: "unchanged",
            detail: "local $eq differs from inherited $eq",
        });
        return branch;
    }

    onTrace?.({
        type: "coverage-removal",
        outcome: "replaced-with-true",
        detail: "local $eq redundant with inherited $eq on same field",
    });
    return trueNode();
}
