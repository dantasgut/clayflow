[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDFlow

# Class: XPBDFlow

Defined in: [elements/physics/flows/XPBDFlow.ts:25](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/XPBDFlow.ts#L25)

## Extends

- `Flow`

## Constructors

### Constructor

> **new XPBDFlow**(`core`, `world`, `resources`, `options?`): `XPBDFlow`

Defined in: [elements/physics/flows/XPBDFlow.ts:42](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/XPBDFlow.ts#L42)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceSystem`

##### options?

`XPBDFlowOptions` = `{}`

#### Returns

`XPBDFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `string`

Defined in: [elements/physics/flows/XPBDFlow.ts:27](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/XPBDFlow.ts#L27)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'physics'`

Defined in: [elements/physics/flows/XPBDFlow.ts:28](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/XPBDFlow.ts#L28)

Fase do pipeline em que o flow executa.

#### Overrides

`Flow.phase`

***

### priority

> **priority**: `number` = `5`

Defined in: [elements/physics/flows/XPBDFlow.ts:29](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/XPBDFlow.ts#L29)

Prioridade dentro da phase. Maior valor = roda primeiro. Default 0.
Útil quando dois flows compartilham phase mas têm dependência de ordem
(e.g. um flow gera dado que outro consome).

#### Overrides

`Flow.priority`

***

### type

> `readonly` **type**: `"XPBDFlow"` = `'XPBDFlow'`

Defined in: [elements/physics/flows/XPBDFlow.ts:26](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/XPBDFlow.ts#L26)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`Flow.type`

## Methods

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [elements/physics/flows/XPBDFlow.ts:206](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/XPBDFlow.ts#L206)

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

Defined in: [elements/physics/flows/XPBDFlow.ts:57](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/XPBDFlow.ts#L57)

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

Defined in: [elements/physics/flows/XPBDFlow.ts:92](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/XPBDFlow.ts#L92)

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

Defined in: [elements/physics/flows/XPBDFlow.ts:96](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/flows/XPBDFlow.ts#L96)

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
