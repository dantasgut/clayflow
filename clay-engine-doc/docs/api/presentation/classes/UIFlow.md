[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UIFlow

# Class: UIFlow

Defined in: [presentation/flows/UIFlow.ts:17](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/UIFlow.ts#L17)

UIFlow orquestra o pipeline de UI: mantém o `UiTree` (modelo), delega
flatten/text-layout para `UiFlattener`/`UiTextLayout`, e o resto (GPU) para
`UiGpuPipeline`. Esta classe é só coordenação: ≤ 100 linhas.

## Extends

- `Flow`

## Constructors

### Constructor

> **new UIFlow**(`core`, `canvas`): `UIFlow`

Defined in: [presentation/flows/UIFlow.ts:26](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/UIFlow.ts#L26)

#### Parameters

##### core

`EngineCore`

##### canvas

`HTMLCanvasElement`

#### Returns

`UIFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `""` = `''`

Defined in: [presentation/flows/UIFlow.ts:19](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/UIFlow.ts#L19)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'ui'`

Defined in: [presentation/flows/UIFlow.ts:20](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/UIFlow.ts#L20)

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

> `readonly` **type**: `"UIFlow"` = `'UIFlow'`

Defined in: [presentation/flows/UIFlow.ts:18](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/UIFlow.ts#L18)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`Flow.type`

## Accessors

### ui

#### Get Signature

> **get** **ui**(): [`UiTree`](UiTree.md)

Defined in: [presentation/flows/UIFlow.ts:32](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/UIFlow.ts#L32)

Acesso à árvore de UI — adicione panels/labels/buttons via `ui.add(...)`.

##### Returns

[`UiTree`](UiTree.md)

## Methods

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [presentation/flows/UIFlow.ts:62](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/UIFlow.ts#L62)

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

Defined in: [presentation/flows/UIFlow.ts:46](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/UIFlow.ts#L46)

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

Defined in: [presentation/flows/UIFlow.ts:58](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/UIFlow.ts#L58)

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

### setFont()

> **setFont**(`font`): `this`

Defined in: [presentation/flows/UIFlow.ts:40](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/UIFlow.ts#L40)

Define a fonte usada pelo UI (atlas + texture). Chamado uma vez
após carregar a fonte via `Application.assets.loadFont(url)`.

#### Parameters

##### font

[`LoadedFont`](../interfaces/LoadedFont.md)

#### Returns

`this`
