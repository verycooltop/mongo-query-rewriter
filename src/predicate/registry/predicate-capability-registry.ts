import { eqEqCapability } from "../capabilities/eq/eq-eq";
import { eqInCapability } from "../capabilities/eq/eq-in";
import { eqNeCapability } from "../capabilities/eq/eq-ne";
import { eqRangeCapability } from "../capabilities/eq/eq-range";
import { rangeRangeCapability } from "../capabilities/range/range-range";
import type { PredicateCapability } from "../capabilities/shared/capability-types";

const DEFAULT_CAPABILITIES: PredicateCapability[] = [
    eqEqCapability,
    eqNeCapability,
    eqInCapability,
    eqRangeCapability,
    rangeRangeCapability,
];

export function getDefaultPredicateCapabilities(): PredicateCapability[] {
    return [...DEFAULT_CAPABILITIES];
}
