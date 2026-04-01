# Mongo Query Normalizer

[English](README.md) | **中文**

一个面向 **MongoDB 查询对象** 的 **可观测、分层式** 规范化器。它以保守默认策略稳定查询 **shape**，并提供 **`predicate`** 与 **`scope`** 两个带有**文档化、测试兜底契约**的层级（见 [SPEC.zh-CN.md](SPEC.zh-CN.md) 与 [docs/normalization-matrix.zh-CN.md](docs/normalization-matrix.zh-CN.md)；英文对照见 [SPEC.md](SPEC.md) 与 [docs/normalization-matrix.md](docs/normalization-matrix.md)）。它返回**可预测**的输出与 **metadata**，而不是 MongoDB 查询规划器优化器。

> **默认策略：** **`shape`** 仅做结构规范化，适合作为**覆盖面最广**的默认路径。 **`predicate`**、**`scope`** 在 **SPEC**、**normalization-matrix** 与 **契约测试** 中有明确边界；仅在需要对应能力且接受「已建模算子」范围时启用；**opaque** 算子保持透传。
>
> **`v0.2.0` 起：** `predicate` 改写面有意收敛到显式验证能力（`eq.eq`、`eq.ne`、`eq.in`、`eq.range`、`range.range`）。高风险组合（如 `null`/缺失语义、数组敏感语义、`$exists`/`$nin`、整对象与点路径混用、opaque 混用）按设计保持保守处理。

---

## 为什么需要它

- 查询 **结构** 在不同写法下容易发散。  
- 没有稳定层时，**对比、日志、回放** 成本高。  
- 需要一层 **低风险** 的 query normalization，默认行为要保守。

本库**不以**「自动让查询更快」或「替代 planner」作为卖点。

---

## 核心特性

- **按 level 分层**：`shape` → `predicate` → `scope`  
- **默认保守**：开箱仅 `shape`（风险最小的结构层）  
- **可观测的 `meta`**：变更、规则、告警、哈希、可选统计  
- **稳定 / 幂等**（相同 options、未熔断时）  
- **不透明（opaque）回退**：不支持的算子以透传为主，不做完整语义改写  

---

## 安装

```bash
npm install mongo-query-normalizer
```

---

## 快速开始

```ts
import { normalizeQuery } from "mongo-query-normalizer";

const result = normalizeQuery({
    $and: [{ status: "open" }, { $and: [{ priority: { $gte: 1 } }] }],
});

console.log(result.query);
console.log(result.meta);
```

---

## 完整使用说明

### 1) 最小可用（推荐默认）

```ts
import { normalizeQuery } from "mongo-query-normalizer";

const { query: normalizedQuery, meta } = normalizeQuery(inputQuery);
```

- 不传 `options` 时，默认 `level: "shape"`。
- 适合日志归一化、缓存 key 稳定化、查询 diff 对齐等“低风险结构规范化”场景。

### 2) 显式选择 level

```ts
normalizeQuery(inputQuery, { level: "shape" }); // 仅结构层（默认）
normalizeQuery(inputQuery, { level: "predicate" }); // 启用已建模谓词整理
normalizeQuery(inputQuery, { level: "scope" }); // 启用 scope 传播/保守剪枝能力
```

- `shape`：结构稳定优先，风险最低。
- `predicate`：在已建模算子范围内做去重、合并、矛盾折叠。
- `scope`：在 `predicate` 之上增加继承约束传播与保守分支决策。

### 3) `options` 全量示例

```ts
import { normalizeQuery } from "mongo-query-normalizer";

const result = normalizeQuery(inputQuery, {
    level: "scope",
    rules: {
        // shape 相关
        flattenLogical: true,
        removeEmptyLogical: true,
        collapseSingleChildLogical: true,
        dedupeLogicalChildren: true,
        // predicate 相关
        dedupeSameFieldPredicates: true,
        mergeComparablePredicates: true,
        collapseContradictions: true,
        // 排序相关
        sortLogicalChildren: true,
        sortFieldPredicates: true,
        // scope 观测规则（仅观测，不上提改写）
        detectCommonPredicatesInOr: true,
    },
    safety: {
        maxNormalizeDepth: 32,
        maxNodeGrowthRatio: 1.5,
    },
    observe: {
        collectWarnings: true,
        collectMetrics: false,
        collectPredicateTraces: false,
        collectScopeTraces: false,
    },
    predicate: {
        safetyPolicy: {
            // 仅覆盖你关心的字段；其余使用默认值
        },
    },
    scope: {
        safetyPolicy: {
            // 仅覆盖你关心的字段；其余使用默认值
        },
    },
});
```

### 4) 用 `resolveNormalizeOptions` 查看最终生效配置

```ts
import { resolveNormalizeOptions } from "mongo-query-normalizer";

const resolvedOptions = resolveNormalizeOptions({
    level: "predicate",
    observe: { collectMetrics: true },
});

console.log(resolvedOptions);
```

- 适合排查“某个规则为何启用/未启用”。
- 适合在服务启动时打印一次“规范化配置快照”。

### 5) 处理返回值（`query` + `meta`）

```ts
const { query: normalizedQuery, meta } = normalizeQuery(inputQuery, options);

if (meta.bailedOut) {
    logger.warn({ reason: meta.bailoutReason }, "normalization bailed out");
}

if (meta.changed) {
    logger.info(
        {
            level: meta.level,
            beforeHash: meta.beforeHash,
            afterHash: meta.afterHash,
            appliedRules: meta.appliedRules,
        },
        "query normalized"
    );
}
```

- `query`：规范化后的查询对象。
- `meta`：观测信息（是否变化、规则轨迹、告警、哈希、可选统计与 trace）。

### 6) 常见接入模式

```ts
// A. 在数据访问层统一规范化
export function normalizeForFind(rawFilter) {
    return normalizeQuery(rawFilter, { level: "shape" }).query;
}

// B. 需要更多收敛能力的离线路径（如批处理）
export function normalizeForBatch(rawFilter) {
    return normalizeQuery(rawFilter, { level: "predicate" }).query;
}
```

- 在线主路径优先 `shape`。
- `predicate` / `scope` 建议在有明确收益与测试兜底时再启用。

### 7) 错误与边界

- `level` 非法会抛错（例如拼写错误）。
- 不支持或未知算子通常按 opaque 保留，不保证参与语义合并。
- 本库目标是“稳定与可观测”，不是查询优化器。

---

## 默认行为说明

- **默认 `level` 为 `shape`**（见 `resolveNormalizeOptions()`）。  
- `shape` 默认**不做**谓词级合并。**`scope`** 主路径是继承约束传播与保守分支决策；**`detectCommonPredicatesInOr`** 为**可选、仅观测**规则（告警/轨迹），**从不**做结构上提。  
- 默认目标是 **稳定与可观测**，不是「智能优化」。  

---

## 如何选择 level

- 仅需结构稳定时，用 **`shape`**。  
- 需要同字段去重、可建模比较合并、矛盾折叠时，用 **`predicate`**（仅针对已建模算子）。  
- 需要继承约束传播、保守剪枝与狭窄覆盖消除时，用 **`scope`**（详见 [SPEC.zh-CN.md](SPEC.zh-CN.md) 与 [docs/normalization-matrix.zh-CN.md](docs/normalization-matrix.zh-CN.md)）。**`detectCommonPredicatesInOr`**（开启时）仅观测，不改写结构。  

**行为边界**以 **SPEC**、**normalization-matrix** 与 **`test/contracts/`** 为准，而非仅靠 README 叙述。

---

## Level 说明

### `shape`（默认）

**推荐默认路径**（风险最小）：只做安全结构规范化，例如：

- 展平复合（`$and` / `$or`）节点  
- 移除空复合节点  
- 折叠单子复合节点  
- 复合子节点去重  
- canonical ordering  

### `predicate`

在 `shape` 之上对**已建模**算子做**保守**谓词整理：

- 同字段谓词去重  
- 可建模的比较类谓词合并  
- 明确矛盾收敛为不可满足过滤器  
- 在 `normalizePredicate` 中，**`$and` 下同名 field 的直接子 `FieldNode` 会先合并**，以便检出诸如 `{ $and: [{ a: 1 }, { a: 2 }] }` 的矛盾  

### `scope`

在 `predicate` 之上：

- **继承约束传播**（phase-1 白名单）、**保守分支剪枝**；**覆盖消除**仅在狭窄、已测试场景且策略允许时进行  
- 可选 **`detectCommonPredicatesInOr`**：仅观测（告警/轨迹）；**不改写**查询结构  

---

## `meta` 说明

| 字段 | 含义 |
|------|------|
| `changed` | 输出相对输入是否变化（基于哈希） |
| `level` | 实际使用的规范化层级 |
| `appliedRules` / `skippedRules` | 规则应用轨迹 |
| `warnings` | `observe.collectWarnings` 为真时的非致命告警（规则说明、检测文案等） |
| `bailedOut` | 是否触发安全熔断 |
| `bailoutReason` | 熔断原因 |
| `beforeHash` / `afterHash` | 前后稳定哈希 |
| `stats` | 可选的前后树统计（`observe.collectMetrics`） |
| `predicateTraces` | `observe.collectPredicateTraces` 为真时：每字段 planner / 跳过 / 矛盾等轨迹 |
| `scopeTrace` | `observe.collectScopeTraces` 为真时：约束抽取拒绝原因与 scope 决策事件 |

---

## 不支持 / opaque 行为

以下结构通常**只透传或不参与完整语义改写**，例如：

`$nor`、`$regex`、`$not`、`$elemMatch`、`$expr`、geo / text、未知算子等。

---

## 稳定性策略

**对外承诺**仅包括：

- `normalizeQuery`  
- `resolveNormalizeOptions`  
- 入口导出的 **类型**  

**不属于**对外契约：内部 AST、`parseQuery`、`compileQuery`、各 pass/rule、工具函数等，版本间可能变化。

---

## 必须明确的原则

1. 默认是 **`shape`**。  
2. **`predicate` / `scope`** 可能改变查询结构，但在已建模算子上追求 **语义等价**。  
3. **opaque** 节点不会被语义重写。  
4. 在未熔断时，输出应对相同 options 保持 **幂等**。  
5. 本库 **不是** MongoDB 的 planner optimizer。  

---

## 示例场景

**在线主路径** —— 使用默认（`shape`）；在 `v0.2.0` 中仍是最稳妥的生产基线：

```ts
normalizeQuery(query);
```

**Predicate 或 Scope** —— 显式传 `level`；请结合 [SPEC.zh-CN.md](SPEC.zh-CN.md) 与契约测试理解“可改写”与“保留”边界：

```ts
normalizeQuery(query, { level: "predicate" });
```

---

## 对外 API

```ts
normalizeQuery(query, options?) => { query, meta }
resolveNormalizeOptions(options?) => ResolvedNormalizeOptions
```

类型：`NormalizeLevel`、`NormalizeOptions`、`NormalizeRules`、`NormalizeSafety`、`NormalizeObserve`、`ResolvedNormalizeOptions`、`NormalizeResult`、`NormalizeStats`、`PredicateSafetyPolicy`、`ScopeSafetyPolicy` 及轨迹相关类型（见包导出）。

---

## 测试

### 测试布局

本仓库按 **对外 API**、**规范化 level** 与 **跨 level 契约** 组织测试，并保留更深的语义与回归套件。

### 目录职责

#### `test/api/`

覆盖对外 API 与配置面。

适合放在此处的验证包括：

* `normalizeQuery` 的返回形态与顶层行为
* `resolveNormalizeOptions`
* 包导出

**不要**把「某一 level 专属的规范化行为」放在这里。

---

#### `test/levels/`

覆盖每个 `NormalizeLevel` 的行为边界。

当前 level：

* `shape`
* `predicate`
* `scope`

每个 level 的测试文件宜聚焦四件事：

1. 该 level 的**正向能力**
2. 该 level **明确未启用**的行为
3. 与**相邻 level** 的对比
4. 少量**代表性契约**

断言上优先：

* 规范化后的 **query 结构**
* **跨 level 可观察的差异**
* **稳定的对外 meta**（如 `meta.level` 等）

尽量避免过度绑定：

* warning **逐字全文**
* 内部 **规则 ID 字符串**
* **子句顺序**（除非顺序本身就是契约的一部分）

---

#### `test/contracts/`

覆盖「应对所有 level 成立」的契约，或与单一 level 无关的默认行为。

适合放在此处的内容包括：

* 默认 level 行为
* 各 level 下的幂等
* 各 level 下的输出不变式
* 各 level 下的 opaque 子树保留
* **`predicate` / `scope` 的正式契约**（支持合并、opaque 保留、scope 策略护栏、规则开关）——见 `test/contracts/predicate-scope-stable-contract.test.js`

全 level 套件请配合 `test/helpers/level-contract-runner.js` 使用。

---

#### `test/semantic/`

对照真实执行行为做**语义等价**验证，确保规范化不改变含义。

该目录有意与 `levels/`、`contracts/` 分开。

---

#### `test/property/`

基于属性的随机测试与变形（metamorphic）行为。

适用于：

* 随机语义检查
* 变形不变式
* 较宽输入空间上的校验

**不要**把它当作表达「level 边界」的主战场。

---

#### `test/regression/`

已知历史失败与手工回归用例。

修复了一个不应再犯的 bug 时，把用例加在这里。

---

#### `test/performance/`

性能护栏或与复杂度相关的行为。

应聚焦性能相关预期，而非一般性的规范化结构细节。

---

### 辅助文件

#### `test/helpers/level-runner.js`

在指定 level 下执行 `normalizeQuery` 的共享封装。

#### `test/helpers/level-cases.js`

跨 level 测试共用的固定输入；优先把可复用的代表用例加在这里，避免在多个文件里复制同一段 fixture。

#### `test/helpers/level-contract-runner.js`

全 level 契约套件共用的 `LEVELS` 与 `forEachLevel` 等辅助逻辑。

---

### 新增测试时的规则

#### 新增一条规范化规则时

先问：

* 是否属于对外 API 行为？→ 加到 `test/api/`
* 是否仅在某一 level 启用？→ 加到 `test/levels/`
* 是否应对所有 level 成立？→ 加到 `test/contracts/`
* 是否关乎语义保持或随机验证？→ 加到 `test/semantic/` 或 `test/property/`
* 是否针对曾坏过的场景的修复？→ 加到 `test/regression/`

---

#### 新增一个 level 时

至少完成：

1. 新增 `test/levels/<level>-level.test.js`
2. 在 `test/helpers/level-contract-runner.js` 中注册该 level
3. 确保全 level 契约套件会跑到它
4. 至少补一条与相邻 level 的**对照**用例

---

### 测试风格建议

宜：

* 用**基于示例**的用例表达 level 边界
* 断言 **query 形状**
* 做**相邻 level 对照**
* **共享**代表性 fixture

忌：

* 把 level 测试绑死在易变的实现细节上
* 同一 fixture 只改断言表面、重复堆砌
* 把「默认 level」契约塞进某个具体 level 文件
* 把导出/API 测试与规范化行为测试混在同一文件语义里

---

### 实用对照

* `api/`：**库怎么用**
* `levels/`：**每一层做与不做**
* `contracts/`：**哪些必须恒真**
* `semantic` / `property` / `regression` / `performance`：**正确、稳健、效率是否仍成立**

---

### npm 脚本与 property 测试工具链

随机语义测试使用 **`mongodb-memory-server`** 与 **`fast-check`**，在固定文档 schema 与受限算子集合下，对比 normalize 前后真实 `find` 结果（相同 `sort` / `skip` / `limit`，投影 `{ _id: 1 }`），并断言 **`_id` 顺序一致**、返回 **`query` 幂等**；对 opaque 算子仅要求**不崩溃、第二次 normalize 稳定**。生成器见 `test/helpers/arbitraries.js`；**`FC_SEED` / `FC_RUNS` 默认值统一由 `test/helpers/fc-config.js` 管理**（也由 `arbitraries.js` 再导出）。

为**避免在线下载** MongoDB 二进制，可在运行语义测试前设置 **`MONGODB_BINARY`**、**`MONGOD_BINARY`** 或 **`MONGOMS_SYSTEM_BINARY`** 指向本机 `mongod`（见 `test/helpers/mongo-fixture.js`）。

* **`npm run test`**：先 build，再 `test:unit`，再 `test:semantic`。
* **`npm run test:api`**：仅 `test/api/**/*.test.js`。
* **`npm run test:levels`**：`test/levels/**/*.test.js` 与 `test/contracts/*.test.js`。
* **`npm run test:unit`**：除 `test/semantic/**`、`test/regression/**`、`test/property/**` 外的 `test/**/*.test.js`（含 `test/api/**`、`test/levels/**`、`test/contracts/**`、`test/performance/**` 等单元侧用例）。
* **`npm run test:semantic`**：语义 + 回归 + property（环境变量未设时的默认见 `fc-config.js`）。
* **`npm run test:semantic:quick`**：降低 **`FC_RUNS`（脚本内为 45）** 并设 **`FC_SEED=42`**，仍包含 `test/regression/**` 与 `test/property/**`。
* **`npm run test:semantic:ci`**：面向 CI（脚本内 `FC_RUNS=200`、`FC_SEED=42`）。

可通过 **`FC_SEED`**、**`FC_RUNS`**、可选 **`FC_QUICK=1`** 覆盖 property 参数（见 `fc-config.js`）。**property 失败如何复现、何时沉淀成固定用例**：见 [`test/REGRESSION.md`](test/REGRESSION.md)。

主随机语义等价**不包含**全文、地理、复杂 `$expr`、`$where`、聚合、collation 等；opaque 算子契约见 **`test/contracts/opaque-operators.all-levels.test.js`**。

---

## 延伸阅读

- [SPEC.zh-CN.md](SPEC.zh-CN.md)  
- [docs/CANONICAL_FORM.md](docs/CANONICAL_FORM.md)  
