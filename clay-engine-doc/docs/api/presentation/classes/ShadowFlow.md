[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ShadowFlow

# Class: ShadowFlow

Defined in: [presentation/flows/ShadowFlow.ts:57](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L57)

ShadowFlow — depth-only render pass do POV de uma directional light.
Identifica o primeiro DirectionalLight com `castShadow=1` no World
e renderiza geometria do mundo em depth32float (mapSize × mapSize).

O depth view resultante é consumido pelo ForwardFlow para PCF shadow
sampling. Single light by design (multi-light shadows = future work).

A posição de cada objeto vem do pool `WorldTransform` (produzido pelo
`TransformFlow`), lido no vertex shader por `instance_index` — o slot da entidade
vai como `firstInstance` do draw; nenhum dado de transformação é enviado por objeto.

## Extends

- `Flow`

## Constructors

### Constructor

> **new ShadowFlow**(`core`, `world`, `resources`, `options?`): `ShadowFlow`

Defined in: [presentation/flows/ShadowFlow.ts:89](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L89)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`PoolDirectory`

##### options?

`ShadowFlowOptions` = `{}`

#### Returns

`ShadowFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `""` = `''`

Defined in: [presentation/flows/ShadowFlow.ts:59](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L59)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'shadow'`

Defined in: [presentation/flows/ShadowFlow.ts:60](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L60)

Fase do pipeline em que o flow executa.

#### Overrides

`Flow.phase`

***

### priority

> **priority**: `number` = `0`

Defined in: [scene/flows/Flow.ts:46](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/scene/flows/Flow.ts#L46)

Prioridade dentro da phase. Maior valor = roda primeiro. Default 0.
Útil quando dois flows compartilham phase mas têm dependência de ordem
(e.g. um flow gera dado que outro consome).

#### Inherited from

[`PostFlow`](PostFlow.md).[`priority`](PostFlow.md#priority)

***

### type

> `readonly` **type**: `"ShadowFlow"` = `'ShadowFlow'`

Defined in: [presentation/flows/ShadowFlow.ts:58](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L58)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`Flow.type`

## Accessors

### currentLightDirection

#### Get Signature

> **get** **currentLightDirection**(): readonly \[`number`, `number`, `number`, `number`\]

Defined in: [presentation/flows/ShadowFlow.ts:170](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L170)

Direção da light em world coords (vec4, w=0). Usada para diffuse shading.

##### Returns

readonly \[`number`, `number`, `number`, `number`\]

***

### currentLightViewProj

#### Get Signature

> **get** **currentLightViewProj**(): readonly `number`[]

Defined in: [presentation/flows/ShadowFlow.ts:165](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L165)

mat4×4 view × projection da light POV. ForwardFlow uploada para shadow PCF sample.

##### Returns

readonly `number`[]

***

### depthTextureView

#### Get Signature

> **get** **depthTextureView**(): `TextureViewSpec` \| `null`

Defined in: [presentation/flows/ShadowFlow.ts:147](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L147)

View do shadow map para ForwardFlow consumir como bind group input.

##### Returns

`TextureViewSpec` \| `null`

## Methods

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [presentation/flows/ShadowFlow.ts:375](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L375)

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

Defined in: [presentation/flows/ShadowFlow.ts:107](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L107)

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

Defined in: [presentation/flows/ShadowFlow.ts:119](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L119)

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

> **onEntitiesRemoved**(`entityIds`): `void`

Defined in: [presentation/flows/ShadowFlow.ts:151](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L151)

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

Defined in: [presentation/flows/ShadowFlow.ts:158](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L158)

O pool de matrizes de mundo foi realocado: o bind group do grupo 1 é recriado.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

#### Overrides

`Flow.onPoolReallocated`

***

### setPreferAsync()

> **setPreferAsync**(`enabled`): `this`

Defined in: [presentation/flows/ShadowFlow.ts:100](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/flows/ShadowFlow.ts#L100)

Habilita async pipeline compilation. Sync mode (default) bloqueia primeiro dispatch.

#### Parameters

##### enabled

`boolean`

#### Returns

`this`
