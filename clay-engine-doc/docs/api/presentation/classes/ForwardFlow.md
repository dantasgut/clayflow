[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlow

# Class: ForwardFlow

Defined in: [presentation/flows/ForwardFlow.ts:61](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L61)

ForwardFlow é o render pass principal. Itera sobre Renderables (entidades
com Geometry + Material + Transform), constrói pipelines per-entity e
dispatcha um render pass com:
  - 4 bindgroups: camera (group 0), transform (1), material (2), shadow (3)
  - depth attachment (depth24plus)
  - color attachment para canvas ou offscreen target (PostFlow ping-pong)

Pode operar em modo offscreen (`setRenderToOffscreen(true)`) renderizando
em uma textura para PostFlow consumir, ou direto no canvasView.

Suporte: shadows via `bindShadowFlow`, profiler timestamps via
`setProfileTimestamps`, async pipeline compilation via `setPreferAsync`.

## Extends

- `RenderFlow`

## Constructors

### Constructor

> **new ForwardFlow**(`core`, `world`, `resources`, `canvas`): `ForwardFlow`

Defined in: [presentation/flows/ForwardFlow.ts:99](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L99)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceSystem`

##### canvas

`HTMLCanvasElement`

#### Returns

`ForwardFlow`

#### Overrides

`RenderFlow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `""` = `''`

Defined in: [presentation/flows/ForwardFlow.ts:63](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L63)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`RenderFlow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'forward'`

Defined in: [presentation/flows/ForwardFlow.ts:64](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L64)

Fase do pipeline em que o flow executa.

#### Overrides

`RenderFlow.phase`

***

### priority

> **priority**: `number` = `0`

Defined in: [presentation/flows/ForwardFlow.ts:65](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L65)

Prioridade dentro da phase. Maior valor = roda primeiro. Default 0.
Útil quando dois flows compartilham phase mas têm dependência de ordem
(e.g. um flow gera dado que outro consome).

#### Overrides

[`PostFlow`](PostFlow.md).[`priority`](PostFlow.md#priority)

***

### type

> `readonly` **type**: `"ForwardFlow"` = `'ForwardFlow'`

Defined in: [presentation/flows/ForwardFlow.ts:62](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L62)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`RenderFlow.type`

## Accessors

### colorOutputView

#### Get Signature

> **get** **colorOutputView**(): `TextureViewSpec` \| `null`

Defined in: [presentation/flows/ForwardFlow.ts:151](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L151)

View da textura offscreen onde ForwardFlow renderiza (quando
setRenderToOffscreen=true). Consumido pelo PostFlow como input do chain.
Null se renderToOffscreen=false ou ainda não inicializado.

##### Returns

`TextureViewSpec` \| `null`

## Methods

### bindShadowFlow()

> **bindShadowFlow**(`shadowFlow`): `this`

Defined in: [presentation/flows/ForwardFlow.ts:113](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L113)

Vincula um ShadowFlow para que ForwardFlow leia o depth map de
shadow no fragment shader. Sem esse bind, shadow é desabilitado
(usa dummy texture branca).

#### Parameters

##### shadowFlow

[`ShadowFlow`](ShadowFlow.md)

#### Returns

`this`

***

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:214](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L214)

Render pass principal por frame. Sequência:
  1. Ensure layouts/depth/shadow/outputColor (idempotente).
  2. Coleta renderables do World (Camera + Geometry + Material + Transform).
  3. Upload uniforms per-frame (camera/transform/material).
  4. Render pass: itera renderables, bind groups, draw.indexed.

#### Parameters

##### frame

`Frame`

#### Returns

`void`

#### Overrides

`RenderFlow.dispatch`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/flows/ForwardFlow.ts:156](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L156)

ForwardFlow não declara pipelines descriptors (cria per-entity em ensureSlot).

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

`RenderFlow.getPipelineDescriptors`

***

### isReady()

> **isReady**(): `boolean`

Defined in: [presentation/flows/ForwardFlow.ts:161](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L161)

Sempre ready — renderizáveis vazios resultam em no-op gracioso.

#### Returns

`boolean`

#### Overrides

`RenderFlow.isReady`

***

### onCanvasResized()

> **onCanvasResized**(`_width`, `_height`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:171](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L171)

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

`RenderFlow.onCanvasResized`

***

### onEntitiesRemoved()

> **onEntitiesRemoved**(`entityIds`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:188](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L188)

Chamado quando entidades são removidas do World. Subclasses que
cacheiam slots por EntityId devem limpar os entries afetados para
evitar leaks de slots órfãos.

#### Parameters

##### entityIds

readonly `number`[]

#### Returns

`void`

#### Overrides

`RenderFlow.onEntitiesRemoved`

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

`RenderFlow.onEvent`

***

### onPoolReallocated()

> **onPoolReallocated**(`_poolKey`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:165](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L165)

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

#### Overrides

`RenderFlow.onPoolReallocated`

***

### recordRenderPass()

> **recordRenderPass**(`_frame`, `_target`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:203](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L203)

RenderFlow base API — no-op em ForwardFlow (lógica inteira em dispatch).

#### Parameters

##### \_frame

`Frame`

##### \_target

`RenderTarget`

#### Returns

`void`

#### Overrides

`RenderFlow.recordRenderPass`

***

### resolveTarget()

> **resolveTarget**(): `RenderTarget`

Defined in: [presentation/flows/ForwardFlow.ts:198](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L198)

RenderFlow base API — não usada por ForwardFlow (que constrói target
inline em dispatch). Lança se chamada fora de dispatch.

#### Returns

`RenderTarget`

#### Overrides

`RenderFlow.resolveTarget`

***

### setPreferAsync()

> **setPreferAsync**(`enabled`): `this`

Defined in: [presentation/flows/ForwardFlow.ts:141](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L141)

Habilita async pipeline compilation (createAsync). Slots novos não
stallam o frame durante shader compile; renderizam quando prontos.

#### Parameters

##### enabled

`boolean`

#### Returns

`this`

***

### setProfileTimestamps()

> **setProfileTimestamps**(`enabled`): `this`

Defined in: [presentation/flows/ForwardFlow.ts:132](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L132)

Habilita timestamp queries no render pass. Requer device com
`timestamp-query` feature. Profiler emite stagesNs em profilerStats event.

#### Parameters

##### enabled

`boolean`

#### Returns

`this`

***

### setRenderToOffscreen()

> **setRenderToOffscreen**(`enabled`): `this`

Defined in: [presentation/flows/ForwardFlow.ts:123](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ForwardFlow.ts#L123)

Alterna entre render direto no canvas (false) ou em uma textura
offscreen consumida pelo PostFlow (true). Habilitado por default
pelo `Application` quando PostFlow está registrado.

#### Parameters

##### enabled

`boolean`

#### Returns

`this`
