# Data Model: Slots de Flow

**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

## SlotDeclaration (C2, `scene/flows/slots.ts`)

Valor imutável criado por `slot.*`. Campos comuns: `kind`, `optional` (default `false`).

| `kind`      | Campos                                                         | Resolvido (`BoundSlot`)                                                                           |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pool`      | `poolKey`                                                      | `{ buffer: StorageBufferSpec \| UniformBufferSpec, count, stride, generation, slotOf(entityId) }` |
| `bodies`    | — (usa o `bodyType` da instância)                              | igual a `pool`                                                                                    |
| `pools`     | `poolKeys[]`                                                   | `Map<poolKey, BoundPool \| empty>`                                                                |
| `singleton` | `schema`, `type?` (classe para filtro)                         | `{ resource, bufferOf(descId) }` ou `absent`                                                      |
| `entities`  | `all: Schema[]`                                                | `{ entries: readonly EntityEntry[], generation }`                                                 |
| `texture`   | `schema`, `descId`                                             | `{ texture, view, generation }`                                                                   |
| `target`    | `'canvas'` ou `{ schema, descId, depth?: { schema, descId } }` | `RenderTarget` montado no `dispatch` a partir de `frame.canvasView` ou das views                  |

`EntityEntry = { entityId, resources: Map<schemaName, Resource>, slotIn(poolKey) }`. Mantido pela C2 em
`entitiesInserted`/`entitiesRemoved` e na troca de Resource de uma entidade.

## Flow (C2, `scene/flows/Flow.ts`) — alterado

| Campo                    | Tipo                                                | Nota                                          |
| ------------------------ | --------------------------------------------------- | --------------------------------------------- |
| `type`                   | `string`                                            | explícito (minificação)                       |
| `slots`                  | `TSlots`                                            | declarações                                   |
| `pipelines`              | `readonly PipelineDescriptor[]`                     | substitui `getPipelineDescriptors()`          |
| `transitions`            | `FlowTransitions<S>`                                | `(estado, evento) → { to, run? } \| 'ignore'` |
| `lifecycle`              | `'pending' \| 'preparing' \| 'ready' \| 'disposed'` | leitura; só a C2 muda                         |
| `state`                  | `S`                                                 | leitura; só transições mudam                  |
| `dispatch(frame, bound)` | —                                                   | único ponto de gravação                       |
| `dispose()`              | —                                                   | libera privados                               |

Removidos: `phase`, `priority`, `bodyType` (vão para o registro), `isReady`, `onEvent`, `onPoolReallocated`,
`onEntitiesInserted`, `onEntitiesRemoved`, `onCanvasResized`, `getPipelineDescriptors`.

`RenderFlow<TSlots, S>`: `TSlots` inclui `target`; `resolveTarget`/`recordRenderPass` saem.

## FlowEvent (C2)

`slotsResolved`, `slotLost { slot }`, `pipelinesCompiled`, `bindGroupReplaced { source, oldSpec, newSpec }`,
`entitiesChanged { slot, added, removed }`, `canvasReconfigured { width, height }`, `poolReallocated { poolKey }`,
`resourceReady { schema, resource }` (só os schemas que o Flow declara em `listens`).

## BoundFlow (C2) — entregue ao `dispatch`

`{ slots: BoundSlots<TSlots>, pipelines: Map<id, PreparedPipeline> }` com
`PreparedPipeline = { spec: RenderPipelineSpec | ComputePipelineSpec, groups: readonly BindGroupSpec[], dynamic:
readonly boolean[] }` (variantes de render indexadas por chave, ex. `frontFace`).

## FlowRegistration / RegisterOptions (C2, `scene/flows/FlowRegistry.ts`)

`RegisterOptions = { type, phase, bodyType?, priority? = 0 }`;
`FlowRegistration<F> = { options, factory, flow: F | undefined (instâncias por bodyType: instances: Map) }`.

## FlowContext (C2)

`{ core: EngineCore, world: World, resources: ResourceDirectory, events: EventBus, bodyType?: string }`.

## ResolvedSource (C2, `scene/consumers/ConsumerResolver.ts`) — substitui `BindingEntry[]`

`{ kind: 'buffer', spec, size?, dynamic?: { stride } } | { kind: 'textureView', spec, sampleType } | { kind:
'sampler', spec, comparison }`, mais `generation` (muda quando a fonte é recriada).

## Pool uniforme (C2, `ResourceSystem`) — novo; sai na Emenda 1 se ficar sem consumidor (R16)

`PoolEntry.addressSpace: 'storage' | 'uniform'`; uniforme: `UniformBufferSpec`, `stride = alignUp(schema.stride,
minUniformBufferOffsetAlignment)`, fonte dinâmica (`offset = slot × stride`). Sem layout/bind group próprios
(saem de `PoolEntry`).

## EntitiesRecord (C2, `scene/flows/slots.ts`) — novo (Emenda 1)

`slot.entities({ all, record? })`; `record = { schema: StructSchema, fields: { [campo]: readonly [ResourceType,
descId] } }`. Cada campo do schema é `u32`. A C2 mantém um pool com chave `schema.name` (compartilhado entre conjuntos
com a mesma declaração) e entrega, por entrada, `recordSlot: number`. Escrita pela C2 em `frameRecording` nos sujos:
completar o conjunto, mudança de um slot referido, troca do Resource referido (inclusive de schema); liberação ao sair.

## Renderable (C3, `elements/scene/Renderable.ts`) — novo schema (Emenda 1)

`StructSchema('Renderable', { transformSlot: u32, materialSlot: u32 })` e a declaração
`{ transformSlot: [Transform, 'world'], materialSlot: [Material, 'material'] }`. Lido por forward e sombra
(`var<storage, read> renderables: array<Renderable>`); `firstInstance` = `recordSlot`.

## Materiais (C3) — alterado (Emenda 1)

`StandardMaterial`, `WireframeMaterial`, `PointSpriteMaterial`: descritor `material` passa de `role: 'uniform'` a
`role: 'storage-ro'` (`storage: 'pool'`); o shader lê `array<Schema>` indexado por `materialSlot`.

## FrameTargets (C4, `presentation/app/FrameTargets.ts`) — novo Resource

| Descritor | Papel     | Forma                                |
| --------- | --------- | ------------------------------------ |
| `color`   | `texture` | `format: 'canvas'`, `sizeFromCanvas` |
| `depth`   | `texture` | `depth24plus`, `sizeFromCanvas`      |

## ShadowMap (C3) — alterado

Schema inalterado (`lightViewProj`, `bias`, `normalBias`, `size`); padrões `bias` 0,005 e `size` [1024, 1024];
descritores: `shadowmap` (pool storage) + `depth` (`texture`, `depth32float`, tamanho de `size`). Anexado pela
`DirectionalLight`.

## ForwardFrameParams (C4) — novo schema (uniform privado do forward)

`lightDir: vec4f`, `shadowEnabled: f32`, `shadowSlot: u32`, padding. Substitui `ForwardShadowParamsSchema`.

## TextureShape (C2) — alterado

`format: GPUTextureFormat | 'canvas'`; uso derivado do formato (profundidade sem `COPY_*`).
