[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlow

# Class: ForwardFlow

Defined in: [presentation/flows/ForwardFlow.ts:70](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L70)

ForwardFlow é o render pass principal. Itera sobre Renderables (entidades
com Geometry + Material + Transform), constrói pipelines per-entity e
dispatcha um render pass com:
  - 4 bindgroups: camera (group 0), matrizes de mundo (1), material (2), shadow (3)
  - o grupo 1 é o pool `WorldTransform` produzido pelo `TransformFlow`, lido no vertex
    shader por `instance_index` (o slot da entidade vai como `firstInstance` do draw)
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

Defined in: [presentation/flows/ForwardFlow.ts:110](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L110)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`PoolDirectory`

##### canvas

`HTMLCanvasElement`

#### Returns

`ForwardFlow`

#### Overrides

`RenderFlow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `""` = `''`

Defined in: [presentation/flows/ForwardFlow.ts:72](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L72)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`RenderFlow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'forward'`

Defined in: [presentation/flows/ForwardFlow.ts:73](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L73)

Fase do pipeline em que o flow executa.

#### Overrides

`RenderFlow.phase`

***

### priority

> **priority**: `number` = `0`

Defined in: [presentation/flows/ForwardFlow.ts:74](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L74)

Prioridade dentro da phase. Maior valor = roda primeiro. Default 0.
Útil quando dois flows compartilham phase mas têm dependência de ordem
(e.g. um flow gera dado que outro consome).

#### Overrides

[`PostFlow`](PostFlow.md).[`priority`](PostFlow.md#priority)

***

### type

> `readonly` **type**: `"ForwardFlow"` = `'ForwardFlow'`

Defined in: [presentation/flows/ForwardFlow.ts:71](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L71)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`RenderFlow.type`

## Accessors

### colorOutputView

#### Get Signature

> **get** **colorOutputView**(): `TextureViewSpec` \| `null`

Defined in: [presentation/flows/ForwardFlow.ts:162](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L162)

View da textura offscreen onde ForwardFlow renderiza (quando
setRenderToOffscreen=true). Consumido pelo PostFlow como input do chain.
Null se renderToOffscreen=false ou ainda não inicializado.

##### Returns

`TextureViewSpec` \| `null`

## Methods

### bindShadowFlow()

> **bindShadowFlow**(`shadowFlow`): `this`

Defined in: [presentation/flows/ForwardFlow.ts:124](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L124)

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

Defined in: [presentation/flows/ForwardFlow.ts:226](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L226)

Render pass principal por frame. Sequência:
  1. Ensure layouts/depth/shadow/outputColor (idempotente).
  2. Coleta renderables do World (Camera + Geometry + Material + Transform).
  3. Upload uniforms per-frame (camera/material) — transformações já estão na GPU.
  4. Render pass: itera renderables, bind groups, draw.indexed com firstInstance = slot.

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

Defined in: [presentation/flows/ForwardFlow.ts:167](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L167)

ForwardFlow não declara pipelines descriptors (cria per-entity em ensureSlot).

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

`RenderFlow.getPipelineDescriptors`

***

### isReady()

> **isReady**(): `boolean`

Defined in: [presentation/flows/ForwardFlow.ts:172](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L172)

Sempre ready — renderizáveis vazios resultam em no-op gracioso.

#### Returns

`boolean`

#### Overrides

`RenderFlow.isReady`

***

### onCanvasResized()

> **onCanvasResized**(`_width`, `_height`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:183](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L183)

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

Defined in: [presentation/flows/ForwardFlow.ts:200](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L200)

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

Defined in: [scene/flows/Flow.ts:66](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/scene/flows/Flow.ts#L66)

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

> **onPoolReallocated**(`poolKey`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:177](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L177)

O pool de matrizes de mundo foi realocado: o bind group do grupo 1 é recriado.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

#### Overrides

`RenderFlow.onPoolReallocated`

***

### recordRenderPass()

> **recordRenderPass**(`_frame`, `_target`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:215](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L215)

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

Defined in: [presentation/flows/ForwardFlow.ts:210](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L210)

RenderFlow base API — não usada por ForwardFlow (que constrói target
inline em dispatch). Lança se chamada fora de dispatch.

#### Returns

`RenderTarget`

#### Overrides

`RenderFlow.resolveTarget`

***

### setPreferAsync()

> **setPreferAsync**(`enabled`): `this`

Defined in: [presentation/flows/ForwardFlow.ts:152](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L152)

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

Defined in: [presentation/flows/ForwardFlow.ts:143](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L143)

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

Defined in: [presentation/flows/ForwardFlow.ts:134](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/ForwardFlow.ts#L134)

Alterna entre render direto no canvas (false) ou em uma textura
offscreen consumida pelo PostFlow (true). Habilitado por default
pelo `Application` quando PostFlow está registrado.

#### Parameters

##### enabled

`boolean`

#### Returns

`this`
