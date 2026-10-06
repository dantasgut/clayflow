[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPFlow

# Class: LCPFlow

Defined in: [elements/physics/flows/LCPFlow.ts:127](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L127)

LCPFlow — solver de RigidBody via LCP (Linear Complementarity Problem) com
4 fases canônicas conforme arquitetura revisada: DetectContacts → AssembleA →
SolvePGS×K → Apply. Cada substep:

  1. `rb_predict`        — integra gravidade + damping em `pos_pred`/`rot_pred`/`vel`
  2. narrowphase × N     — uma variante por pool de Collider (Plane/Box/Sphere/Mesh)
  3. `rb_build_lcp`      — preenche bias `b_vec` + diagonais Delassus por contato
  4. `rb_solve_lcp`      — warm-start + K Gauss-Seidel (single-threaded por design)
  5. `rb_lcp_commit`     — escreve velocidades corrigidas + correção posicional

Ao fim do frame, faz CPU readback do pool de bodies e publica a pose (posição e
rotação) no `Transform` de cada entidade; a mutação reativa leva a pose à GPU no
quadro seguinte e o `TransformFlow` produz a matriz de mundo. A escala do `Transform`
é do desenvolvedor e não é tocada. (O readback some na F2, quando a física escrever a
pose direto na GPU.)

## Extends

- `Flow`

## Constructors

### Constructor

> **new LCPFlow**(`core`, `world`, `resources`, `options?`): `LCPFlow`

Defined in: [elements/physics/flows/LCPFlow.ts:157](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L157)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceSystem`

##### options?

[`LCPFlowOptions`](../interfaces/LCPFlowOptions.md) = `{}`

#### Returns

`LCPFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `"LCPSchema"` = `'LCPSchema'`

Defined in: [elements/physics/flows/LCPFlow.ts:129](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L129)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'physics'`

Defined in: [elements/physics/flows/LCPFlow.ts:130](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L130)

Fase do pipeline em que o flow executa.

#### Overrides

`Flow.phase`

***

### priority

> **priority**: `number` = `10`

Defined in: [elements/physics/flows/LCPFlow.ts:131](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L131)

Prioridade dentro da phase. Maior valor = roda primeiro. Default 0.
Útil quando dois flows compartilham phase mas têm dependência de ordem
(e.g. um flow gera dado que outro consome).

#### Overrides

`Flow.priority`

***

### type

> `readonly` **type**: `"LCPFlow"` = `'LCPFlow'`

Defined in: [elements/physics/flows/LCPFlow.ts:128](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L128)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`Flow.type`

## Methods

### applyTransformsFromReadback()

> `protected` **applyTransformsFromReadback**(`ab`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:638](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L638)

Publica a pose lida da GPU no `Transform` de cada corpo: só posição e rotação
(normalizada; nula ⇒ identidade). A escala não é tocada.

#### Parameters

##### ab

`ArrayBuffer`

#### Returns

`void`

***

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:501](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L501)

Hot path: chamado uma vez por frame quando o flow está ready. O `frame`
contém o command encoder ativo — use `frame.compute(...)` ou
`frame.render(target, ...)` para emitir comandos GPU.

#### Parameters

##### frame

`Frame`

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/flows/LCPFlow.ts:170](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L170)

Retorna os descritores de pipelines GPU que este flow precisa criar
(para introspeção arquitetural / debugging — o flow ainda materializa
via core.create internamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

`Flow.getPipelineDescriptors`

***

### isReady()

> **isReady**(): `boolean`

Defined in: [elements/physics/flows/LCPFlow.ts:213](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L213)

Indica se o flow tem trabalho válido para esta frame. Default: true
(sempre dispatch). Override para gating em prerequisites: e.g. presença
de Camera no World, pool não-vazio, pipeline async ainda compilando.
ExecutionSystem skipa flows com `isReady() === false`.

#### Returns

`boolean`

#### Overrides

`Flow.isReady`

***

### onCanvasResized()

> **onCanvasResized**(`_width`, `_height`): `void`

Defined in: [scene/flows/Flow.ts:97](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/scene/flows/Flow.ts#L97)

Chamado quando o canvas é redimensionado. Subclasses que mantêm
textures de tamanho-de-canvas (depth, color offscreen, ping-pong)
devem destruir e nullificar para recriarem na próxima dispatch.
Importante: destruir bindgroups que referenciam essas textures ANTES
para evitar use-after-free na GPU.

#### Parameters

##### \_width

`number`

##### \_height

`number`

#### Returns

`void`

#### Inherited from

`Flow.onCanvasResized`

***

### onEntitiesRemoved()

> **onEntitiesRemoved**(`_ids`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:234](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L234)

Chamado quando entidades são removidas do World. Subclasses que
cacheiam slots por EntityId devem limpar os entries afetados para
evitar leaks de slots órfãos.

#### Parameters

##### \_ids

readonly `number`[]

#### Returns

`void`

#### Overrides

`Flow.onEntitiesRemoved`

***

### onEvent()

> **onEvent**(`_event`, `_payload`): `void`

Defined in: [scene/flows/Flow.ts:66](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/scene/flows/Flow.ts#L66)

Hook genérico de eventos. Default no-op. A maioria dos flows usa os
hooks específicos abaixo (`onPoolReallocated`, etc.) ao invés deste.

#### Parameters

##### \_event

`string`

##### \_payload

`unknown`

#### Returns

`void`

#### Inherited from

`Flow.onEvent`

***

### onPoolReallocated()

> **onPoolReallocated**(`poolKey`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:217](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/flows/LCPFlow.ts#L217)

Chamado quando um pool com `poolKey` tem seu buffer realocado pelo
ResourceSystem (growth 2× ou regeneração). Subclasses que cacheiam
`BindGroupSpec` dependentes do pool devem invalidar o cache aqui
(set para null) para que a próxima dispatch reconstrua via
`resources.poolBindGroup(poolKey)`.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

#### Overrides

`Flow.onPoolReallocated`
