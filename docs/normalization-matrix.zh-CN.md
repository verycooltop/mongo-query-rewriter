# 规范化能力与传播矩阵（中文）

与英文版 [normalization-matrix.md](./normalization-matrix.md) 对齐，描述当前实现（`shape` → `predicate` → `scope`）。对外 `NormalizeLevel` 仅为这三个取值，**不存在**独立的 `experimental` level。用于判断新能力应落在 **predicate**（仅本地 field bundle）还是 **scope**（继承约束 + 分支决策）。

**边界**

- **Predicate：** 仅按字段 bundle 做局部分析；矛盾 / 覆盖 / 收紧 / 规范化；无父上下文。  
- **Scope：** **继承约束传播**、**保守分支剪枝**、策略允许时的狭窄 **覆盖消除**；按安全策略折叠或保留分支；除已配置改写外不新增算子级合并。可选 **`detectCommonPredicatesInOr`** 为 observe-only（告警），不做结构改写。  
- **Semantic** **不是**单独的规范化 level。

Predicate 图例：**supported**（默认会跑）、**guarded**（需显式 `PredicateSafetyPolicy`）、**skipped**（planner 带原因跳过）、**unsupported**（未实现为 capability）。

Scope 图例：**allowed**、**allowed with guard**（策略开关）、**preserve only**（不变换）、**unsupported**（未实现）。

---

## 1. Predicate 能力矩阵

| Capability id | 状态 | 默认开启？ | 说明 |
|---------------|------|------------|------|
| `eq.eq` | supported | 是（合并类规则开启时） | 同值 `$eq` 去重 / 合并。 |
| `eq.ne` | supported | 是 | 与同值 `$eq` 矛盾。 |
| `eq.in` | guarded / skipped | 安全时 | 数组敏感且 `!allowArraySensitiveRewrite` 时跳过；null 语义且 `!allowNullSemanticRewrite` 时跳过。 |
| `eq.range` | supported | 是 | `$eq` 与 range 冲突。 |
| `range.range` | supported | 是 | 可比 range 合并。 |
| `in.in` | unsupported | — | 默认 registry 未注册。 |
| `in.nin` | unsupported | — | 同上。 |
| `exists.*` | unsupported | — | IR 有原子，默认无专门合并 capability。 |
| `null.*` | 策略跳过 | — | 经 `hasNullSemantics` 等门控间接处理。 |

Opaque / 混合 bundle：`bailoutOnUnsupportedMix` 为 true（默认）时，planner 跳过全部 capabilities，原因 `unsupported opaque mix in bundle`。

---

## 2. Scope 传播矩阵

| 场景 | 状态 | 说明 |
|------|------|------|
| 根 → `$and` 子节点 | allowed | 每子节点合并兄弟字段约束到继承集（phase-1 白名单）。 |
| 根 → `$or` 分支 | allowed | `allowOrPropagation` 时各分支共享同一继承集。 |
| `$and` 兄弟 → 子 | allowed | 递归前按子做兄弟合并。 |
| `$or` → 嵌套分支 | allowed | 覆盖剥离 + 按分支可选剪枝。 |
| `$nor` / `$not` | preserve only | phase 1 不作为安全传播源；无对外开关，相关子树不参与继承约束抽取。 |
| 单分支 `$or` 折叠 | allowed with guard | `allowSingleBranchCollapse`。 |
| 覆盖消除本地约束 | allowed with guard | `allowConstraintCoverageElimination`；若继承元数据 `hasUnsupportedSemantics` 且 `bailoutOnUnsupportedScopeMix` 则熔断式保留。 |

---

## 3. ConstraintSet phase-1 内容

**允许进入 `byField`（过滤后）：** 非数组敏感、非 null 敏感、非 opaque、无点路径冲突风险的 bundle 上的 `eq`、`gt`、`gte`、`lt`、`lte`、`in`。

**拒绝（记入 `metadata.extractionRejections`，原 AST 保留）：** `exists`、`ne`、`nin`、`opaque`、字段级标为不支持的 bundle 上任意原子、非 `$and` 复合形状作为约束源等。

---

## 4. 调试 / meta

- **`observe.collectPredicateTraces`** → `meta.predicateTraces[]`  
- **`observe.collectScopeTraces`** → `meta.scopeTrace`（`constraintRejections` 与 `events`）

---

## 5. `v0.2.0` 说明

`v0.2.0` 将 predicate 改写收敛为“保守 + 显式验证”模型：

- 已验证能力：`eq.eq`、`eq.ne`、`eq.in`、`eq.range`、`range.range`
- 高风险组合保持保守（优先保留），包括 `null`/缺失语义、数组敏感语义、`$exists` / `$nin`、整对象与点路径交互、opaque 混用
