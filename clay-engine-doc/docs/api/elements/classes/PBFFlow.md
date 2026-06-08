[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFFlow

# Class: PBFFlow

Defined in: [elements/physics/flows/PBFFlow.ts:36](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/PBFFlow.ts#L36)

## Extends

- `Flow`

## Constructors

### Constructor

> **new PBFFlow**(`core`, `world`, `resources`, `options?`): `PBFFlow`

Defined in: [elements/physics/flows/PBFFlow.ts:57](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/PBFFlow.ts#L57)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceSystem`

##### options?

`PBFFlowOptions` = `{}`

#### Returns

`PBFFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `"PBFSchema"` = `'PBFSchema'`

Defined in: [elements/physics/flows/PBFFlow.ts:38](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/PBFFlow.ts#L38)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'physics'`

Defined in: [elements/physics/flows/PBFFlow.ts:39](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/PBFFlow.ts#L39)

Fase do pipeline em que o flow executa.

#### Overrides

`Flow.phase`

***

### priority

> **priority**: `number` = `0`

Defined in: [scene/flows/Flow.ts:45](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/flows/Flow.ts#L45)

Prioridade dentro da phase. Maior valor = roda primeiro. Default 0.
Útil quando dois flows compartilham phase mas têm dependência de ordem
(e.g. um flow gera dado que outro consome).

#### Inherited from

`Flow.priority`

***

### type

> `readonly` **type**: `"PBFFlow"` = `'PBFFlow'`

Defined in: [elements/physics/flows/PBFFlow.ts:37](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/PBFFlow.ts#L37)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`Flow.type`

## Methods

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [elements/physics/flows/PBFFlow.ts:306](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/PBFFlow.ts#L306)

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

Defined in: [elements/physics/flows/PBFFlow.ts:76](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/PBFFlow.ts#L76)

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

Defined in: [elements/physics/flows/PBFFlow.ts:131](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/PBFFlow.ts#L131)

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

Defined in: [scene/flows/Flow.ts:96](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/flows/Flow.ts#L96)

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

> **onEntitiesRemoved**(`_entityIds`): `void`

Defined in: [scene/flows/Flow.ts:85](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/flows/Flow.ts#L85)

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

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/flows/Flow.ts#L65)

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

Defined in: [elements/physics/flows/PBFFlow.ts:135](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/PBFFlow.ts#L135)

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
