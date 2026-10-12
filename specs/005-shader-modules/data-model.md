# Data Model: Núcleo de shaders

**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

Entidades novas ou alteradas. Tipos em notação TS resumida; contratos completos em [contracts/](./contracts/).

## WgslModule (C2, `scene/shaders/`)

| Campo      | Tipo                      | Regra                                                                                  |
| ---------- | ------------------------- | -------------------------------------------------------------------------------------- |
| `name`     | `string`                  | Não vazio; único dentro de um grafo de montagem (dois objetos com o mesmo nome → erro) |
| `source`   | `string`                  | WGSL; pode conter marcadores `{{struct:Nome}}`                                         |
| `requires` | `readonly WgslModule[]`   | Referências; ordem preservada na montagem                                              |
| `structs`  | `readonly StructSchema[]` | Schemas cujos structs o módulo usa; emitidos uma vez por shader                        |
| `symbols`  | `readonly WgslSymbol[]`   | Derivado na criação pelo varredor: símbolos de nível superior definidos pelo fonte     |

- Criado por `wgslModule({ name, source, requires?, structs? })`; congelado; imutável.
- `WgslSymbol = { name, kind: 'fn' | 'struct' | 'const' | 'override' | 'alias' | 'var' }`.

## ComposedShader (C2)

Resultado de `composeWgsl(entry)`; memorizado por módulo de entrada.

| Campo     | Tipo                          | Regra                                                                       |
| --------- | ----------------------------- | --------------------------------------------------------------------------- |
| `spec`    | `ShaderModuleSpec`            | Congelado; `discriminator = 'wgsl:' + entry.name`; mesmo objeto por entrada |
| `modules` | `readonly string[]`           | Nomes em ordem de inclusão (diagnóstico e testes)                           |
| `symbols` | `ReadonlyMap<string, string>` | símbolo → módulo que o define                                               |

**Erros** (todos `WgslCompositionError` com `kind`): `cycle` (caminho), `duplicate-module-name` (nome + dependentes),
`symbol-conflict` (símbolo + módulos), `struct-marker` (marcador sem schema + módulo), `struct-conflict` (dois schemas
distintos com o mesmo `wgslName`).

## StructSchema (C2, `scene/descriptors/`) — alterado

| Campo/método                   | Mudança                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `wgslName`                     | **novo** — nome do struct WGSL (padrão `name`; `name` continua sendo o pool key)                         |
| `addressSpace`                 | **novo** — `'storage'` (padrão) ou `'uniform'`; muda arredondamentos e proíbe atômicos/array em execução |
| `fields`                       | aceita `FieldType` primitivo, `array(elem, n)`, `struct(schema)`, `runtimeArray(elem)` (último campo)    |
| `layout`/`stride`/`offsetOf`   | calculados pelas regras do `addressSpace`                                                                |
| `toWGSL()`                     | tipos válidos (forma curta), `wgslName`, arrays/aninhados/atômicos                                       |
| `packInto(view, offset, data)` | **novo** — empacota sem alocar; `pack()` delega                                                          |

`FieldType`: remove `u16`/`i16`; adiciona `atomicU32`, `atomicI32`. Construtores de tipo composto:
`FieldType.array(elem, n)`, `FieldType.struct(schema)`, `FieldType.runtimeArray(elem)`.

**Regras de layout** (WGSL):

| Tipo                  | storage: align / tamanho                  | uniform: align / tamanho                        |
| --------------------- | ----------------------------------------- | ----------------------------------------------- |
| escalar, atômico      | 4 / 4                                     | 4 / 4 (atômico proibido)                        |
| vec2                  | 8 / 8                                     | 8 / 8                                           |
| vec3                  | 16 / 12                                   | 16 / 12                                         |
| vec4                  | 16 / 16                                   | 16 / 16                                         |
| mat3x3f               | 16 / 48                                   | 16 / 48                                         |
| mat4x4f               | 16 / 64                                   | 16 / 64                                         |
| `array<E, N>`         | align(E) / N × roundUp(align(E), size(E)) | roundUp(16, align(E)) / N × roundUp(16, stride) |
| struct aninhado S     | align(S) / roundUp(align(S), size(S))     | roundUp(16, align(S)) / roundUp(16, size(S))    |
| `array<E>` (execução) | último campo, só storage                  | proibido                                        |

## Schemas novos de dado interno (C3/C4)

| Schema                      | `wgslName`            | Espaço  | Dono                                                 |
| --------------------------- | --------------------- | ------- | ---------------------------------------------------- |
| `SimParamsSchema`           | `SimParams`           | uniform | `XPBDFlow`                                           |
| `FEMSimParamsSchema`        | `FEMSimParams`        | uniform | `FEMFlow`                                            |
| `MPMSimParamsSchema`        | `MPMSimParams`        | uniform | `MPMFlow`                                            |
| `SPHSimParamsSchema`        | `SPHSimParams`        | uniform | `SPHFlow`                                            |
| `PBFSimParamsSchema`        | `PBFSimParams`        | uniform | `PBFFlow`                                            |
| `RBSimParamsSchema`         | `RBSimParams`         | uniform | `LCPFlow`                                            |
| `NarrowphaseParamsSchema`   | `NarrowphaseParams`   | uniform | `LCPFlow`                                            |
| `RBContactSchema`           | `RBContact`           | storage | `LCPFlow`                                            |
| `RBWarmEntrySchema`         | `RBWarmEntry`         | storage | `LCPFlow` (campos atômicos)                          |
| `RBBodyDeltaSchema`         | `RBBodyDelta`         | storage | `LCPFlow` (atômicos)                                 |
| `RBBodyCorrectionSchema`    | `RBBodyCorrection`    | storage | `LCPFlow` (atômicos)                                 |
| `AtomicAllocCounterSchema`  | `AtomicAllocCounter`  | storage | módulo `atomic_alloc` (substitui `RBContactCounter`) |
| `MPMGridNodeSchema`         | `MPMGridNode`         | storage | `MPMFlow` (atômicos)                                 |
| `NsSimParamsSchema`         | `NsSimParams`         | uniform | `NeighborSearchPipeline`                             |
| `ScanLevelSchema`           | `ScanLevel`           | uniform | `PrefixSum` (substitui `NsScanLevel`)                |
| `ColorRangeSchema`          | `ColorRange`          | storage | `GraphColoring`                                      |
| `TransformParamsSchema`     | `TransformParams`     | uniform | `TransformFlow`                                      |
| `ForwardShadowParamsSchema` | `ForwardShadowParams` | uniform | forward                                              |
| `ShadowDepthParamsSchema`   | `ShadowDepthParams`   | uniform | `ShadowFlow`                                         |
| `EffectParamsSchema`        | `EffectParams`        | uniform | `PostFlow`                                           |
| `ScreenParamsSchema`        | `ScreenParams`        | uniform | `UiGpuPipeline`                                      |
| `UiQuadSchema`              | `UiQuad`              | storage | `UiGpuPipeline`                                      |

Schemas existentes ganham `wgslName` onde o pool key difere: `LCPSchema`/`XPBDRigidSchema` → `RigidBody`,
`XPBDSoftSchema`/`FEMSchema` → `Particle`, `MPMSoftSchema`/`MPMFluidSchema` → `MPMParticle`, `SPHSchema` →
`SPHParticle`, `PBFSchema` → `PBFParticle`. Dois schemas com o mesmo `wgslName` só podem entrar no mesmo shader se
tiverem layout idêntico (senão `struct-conflict`).

## PerStepUniforms (C3) — alterado

| Antes                         | Depois                                         |
| ----------------------------- | ---------------------------------------------- |
| `{ discriminator, byteSize }` | `{ discriminator, schema }` (schema `uniform`) |
| `f32(i)` / `u32(i)` + índices | `write(i, data)` via `schema.packInto`         |
| `binding(b).size = byteSize`  | `size = schema.stride`                         |

## Kernels genéricos (C3, `elements/gpu/compute/`)

| Entidade        | Estado                                                                          | Entradas → saídas                                                        |
| --------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `PrefixSum`     | buffers de níveis por capacidade; uniform `ScanLevel` por nível                 | `u32[count]` → `u32[count]` (exclusiva/inclusiva)                        |
| `RadixSort`     | 2 pares de buffers (pingue-pongue), histograma 16 × grupos, `PrefixSum` interno | chaves/valores `u32[count]` → ordenados (estável)                        |
| `Compaction`    | contador `AtomicAllocCounter`; modo `stable` usa `PrefixSum`                    | predicado (módulo) sobre `count` → `u32[≤capacity]` + contagem/excedente |
| `Reduce`        | níveis por capacidade; módulo de operação                                       | `T[count]` → `T` (sum/min/max; u32/i32/f32)                              |
| `GraphColoring` | `vmax`, cores, `RadixSort`, `Reduce`, `PrefixSum` internos                      | arestas `vec2u[count]` → cor por aresta + `ColorRange[]` (assíncrono)    |

Módulos de suporte: `fixed_point` (`fixed_from_f32`, `fixed_to_f32`, saturação), `atomic_alloc` (`atomic_alloc`,
`ATOMIC_ALLOC_FULL`), `reduceOp(op, type)`.

## Inventário de WGSL (`specs/005-shader-modules/inventory.md`)

Uma linha por arquivo do legado (23): arquivo · o que foi extraído → módulo · motivo da remoção · fase que escreve o
estágio. Mais uma seção com a auditoria de matemática repetida em CPU (FR-017): controllers de câmera e `ShadowFlow`
→ 006/F2.
