[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / DebugFlow

# Class: DebugFlow

Defined in: [presentation/flows/DebugFlow.ts:32](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L32)

DebugFlow — overlay opcional de FPS/frame time + emissão periódica de
`profilerStats`. Não desenha nada por padrão (flow lightweight); um
UIFlow/UiText pode subscrever ao evento e renderizar o texto.

## Extends

- `Flow`

## Constructors

### Constructor

> **new DebugFlow**(`options?`): `DebugFlow`

Defined in: [presentation/flows/DebugFlow.ts:46](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L46)

#### Parameters

##### options?

`DebugFlowOptions` = `{}`

#### Returns

`DebugFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `""` = `''`

Defined in: [presentation/flows/DebugFlow.ts:34](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L34)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'forward'`

Defined in: [presentation/flows/DebugFlow.ts:35](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L35)

Fase do pipeline em que o flow executa.

#### Overrides

`Flow.phase`

***

### priority

> **priority**: `number` = `-100`

Defined in: [presentation/flows/DebugFlow.ts:36](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L36)

Prioridade dentro da phase. Maior valor = roda primeiro. Default 0.
Útil quando dois flows compartilham phase mas têm dependência de ordem
(e.g. um flow gera dado que outro consome).

#### Overrides

`Flow.priority`

***

### type

> `readonly` **type**: `"DebugFlow"` = `'DebugFlow'`

Defined in: [presentation/flows/DebugFlow.ts:33](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L33)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`Flow.type`

## Methods

### bindEvents()

> **bindEvents**(`events`): `this`

Defined in: [presentation/flows/DebugFlow.ts:54](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L54)

Anexa o flow a um EventBus para emitir profilerStats e ouvir tecla F1.

#### Parameters

##### events

`EventBus`

#### Returns

`this`

***

### dispatch()

> **dispatch**(`_frame`): `void`

Defined in: [presentation/flows/DebugFlow.ts:104](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L104)

Hot path: chamado uma vez por frame quando o flow está ready. O `frame`
contém o command encoder ativo — use `frame.compute(...)` ou
`frame.render(target, ...)` para emitir comandos GPU.

#### Parameters

##### \_frame

`Frame`

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/flows/DebugFlow.ts:76](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L76)

Retorna os descritores de pipelines GPU que este flow precisa criar
(para introspeção arquitetural / debugging — o flow ainda materializa
via core.create internamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

`Flow.getPipelineDescriptors`

***

### isEnabled()

> **isEnabled**(): `boolean`

Defined in: [presentation/flows/DebugFlow.ts:72](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L72)

True se DebugFlow está coletando + emitindo stats.

#### Returns

`boolean`

***

### isReady()

> **isReady**(): `boolean`

Defined in: [presentation/flows/DebugFlow.ts:80](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L80)

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

> **onPoolReallocated**(`_poolKey`): `void`

Defined in: [scene/flows/Flow.ts:76](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/flows/Flow.ts#L76)

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

***

### setEnabled()

> **setEnabled**(`value`): `void`

Defined in: [presentation/flows/DebugFlow.ts:68](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/DebugFlow.ts#L68)

Habilita/desabilita emissão de profilerStats event a cada frame.

#### Parameters

##### value

`boolean`

#### Returns

`void`
