export type PredicateAtom =
    | { kind: "eq"; value: unknown }
    | { kind: "ne"; value: unknown }
    | { kind: "in"; values: unknown[] }
    | { kind: "nin"; values: unknown[] }
    | { kind: "gt"; value: unknown }
    | { kind: "gte"; value: unknown }
    | { kind: "lt"; value: unknown }
    | { kind: "lte"; value: unknown }
    | { kind: "exists"; value: boolean }
    | { kind: "opaque"; operator: string; raw: unknown };
