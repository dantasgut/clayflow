[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PostFlow

# Class: PostFlow

Defined in: [presentation/flows/PostFlow.ts:31](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L31)

## Extends

- `Flow`

## Constructors

### Constructor

> **new PostFlow**(`options`, `core`): `PostFlow`

Defined in: [presentation/flows/PostFlow.ts:50](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L50)

#### Parameters

##### options

`PostFlowOptions` \| `undefined`

##### core

`EngineCore`

#### Returns

`PostFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `""` = `''`

Defined in: [presentation/flows/PostFlow.ts:33](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L33)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'post'`

Defined in: [presentation/flows/PostFlow.ts:34](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L34)

Fase do pipeline em que o flow executa.

#### Overrides

`Flow.phase`

***

### priority

> **priority**: `number` = `0`

Defined in: [scene/flows/Flow.ts:45](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/flows/Flow.ts#L45)

Prioridade dentro da phase. Maior valor = roda primeiro. Default 0.
Útil quando dois flows compartilham phase mas têm dependência de ordem
(e.g. um flow gera dado que outro consome).

#### Inherited from

`Flow.priority`

***

### type

> `readonly` **type**: `"PostFlow"` = `'PostFlow'`

Defined in: [presentation/flows/PostFlow.ts:32](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L32)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`Flow.type`

## Methods

### addEffect()

> **addEffect**(`effect`): `this`

Defined in: [presentation/flows/PostFlow.ts:81](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L81)

Empilha um efeito no chain. A ordem é importante: efeitos são aplicados
em sequência (`Bloom → ToneMapping → Fxaa → ...`). Builder fluente.

#### Parameters

##### effect

[`PostProcessEffect`](PostProcessEffect.md)

#### Returns

`this`

***

### bindForwardFlow()

> **bindForwardFlow**(`flow`): `this`

Defined in: [presentation/flows/PostFlow.ts:62](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L62)

Liga este PostFlow a um ForwardFlow upstream (PostFlow lê o offscreen
texture do Forward como input do ping-pong). Builder fluente.

#### Parameters

##### flow

[`ForwardFlow`](ForwardFlow.md)

#### Returns

`this`

***

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [presentation/flows/PostFlow.ts:267](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L267)

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

Defined in: [presentation/flows/PostFlow.ts:67](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L67)

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

Defined in: [presentation/flows/PostFlow.ts:86](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L86)

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

Defined in: [presentation/flows/PostFlow.ts:90](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/PostFlow.ts#L90)

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

#### Overrides

`Flow.onCanvasResized`

***

### onEntitiesRemoved()

> **onEntitiesRemoved**(`_entityIds`): `void`

Defined in: [scene/flows/Flow.ts:85](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/flows/Flow.ts#L85)

Chamado quando entidades são removidas do World. Subclasses que
cacheiam slots por EntityId devem limpar os entries afetados para
evitar leaks de slots órfãos.

#### Parameters

##### \_entityIds

readonly `number`[]

#### Returns

`void`

#### Inherited from

`Flow.onEntitiesRemoved`

***

### onEvent()

> **onEvent**(`_event`, `_payload`): `void`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/flows/Flow.ts#L65)

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

> **onPoolReallocated**(`_poolKey`): `void`

Defined in: [scene/flows/Flow.ts:76](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/flows/Flow.ts#L76)

Chamado quando um pool com `poolKey` tem seu buffer realocado pelo
ResourceSystem (growth 2× ou regeneração). Subclasses que cacheiam
`BindGroupSpec` dependentes do pool devem invalidar o cache aqui
(set para null) para que a próxima dispatch reconstrua via
`resources.poolBindGroup(poolKey)`.

#### Parameters

##### \_poolKey

`string`

#### Returns

`void`

#### Inherited from

`Flow.onPoolReallocated`
