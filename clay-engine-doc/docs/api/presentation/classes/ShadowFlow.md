[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ShadowFlow

# Class: ShadowFlow

Defined in: [presentation/flows/ShadowFlow.ts:54](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L54)

ShadowFlow — depth-only render pass do POV de uma directional light.
Identifica o primeiro DirectionalLight com `castShadow=1` no World
e renderiza geometria do mundo em depth32float (mapSize × mapSize).

O depth view resultante é consumido pelo ForwardFlow para PCF shadow
sampling. Single light by design (multi-light shadows = future work).

## Extends

- `Flow`

## Constructors

### Constructor

> **new ShadowFlow**(`core`, `world`, `resources`, `options?`): `ShadowFlow`

Defined in: [presentation/flows/ShadowFlow.ts:82](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L82)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceSystem`

##### options?

`ShadowFlowOptions` = `{}`

#### Returns

`ShadowFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `""` = `''`

Defined in: [presentation/flows/ShadowFlow.ts:56](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L56)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'shadow'`

Defined in: [presentation/flows/ShadowFlow.ts:57](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L57)

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

[`PostFlow`](PostFlow.md).[`priority`](PostFlow.md#priority)

***

### type

> `readonly` **type**: `"ShadowFlow"` = `'ShadowFlow'`

Defined in: [presentation/flows/ShadowFlow.ts:55](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L55)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`Flow.type`

## Accessors

### currentLightDirection

#### Get Signature

> **get** **currentLightDirection**(): readonly \[`number`, `number`, `number`, `number`\]

Defined in: [presentation/flows/ShadowFlow.ts:156](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L156)

Direção da light em world coords (vec4, w=0). Usada para diffuse shading.

##### Returns

readonly \[`number`, `number`, `number`, `number`\]

***

### currentLightViewProj

#### Get Signature

> **get** **currentLightViewProj**(): readonly `number`[]

Defined in: [presentation/flows/ShadowFlow.ts:151](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L151)

mat4×4 view × projection da light POV. ForwardFlow uploada para shadow PCF sample.

##### Returns

readonly `number`[]

***

### depthTextureView

#### Get Signature

> **get** **depthTextureView**(): `TextureViewSpec` \| `null`

Defined in: [presentation/flows/ShadowFlow.ts:140](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L140)

View do shadow map para ForwardFlow consumir como bind group input.

##### Returns

`TextureViewSpec` \| `null`

## Methods

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [presentation/flows/ShadowFlow.ts:375](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L375)

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

Defined in: [presentation/flows/ShadowFlow.ts:100](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L100)

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

Defined in: [presentation/flows/ShadowFlow.ts:112](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L112)

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

Defined in: [scene/flows/Flow.ts:96](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/flows/Flow.ts#L96)

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

> **onEntitiesRemoved**(`entityIds`): `void`

Defined in: [presentation/flows/ShadowFlow.ts:144](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L144)

Chamado quando entidades são removidas do World. Subclasses que
cacheiam slots por EntityId devem limpar os entries afetados para
evitar leaks de slots órfãos.

#### Parameters

##### entityIds

readonly `number`[]

#### Returns

`void`

#### Overrides

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

***

### setPreferAsync()

> **setPreferAsync**(`enabled`): `this`

Defined in: [presentation/flows/ShadowFlow.ts:93](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/flows/ShadowFlow.ts#L93)

Habilita async pipeline compilation. Sync mode (default) bloqueia primeiro dispatch.

#### Parameters

##### enabled

`boolean`

#### Returns

`this`
