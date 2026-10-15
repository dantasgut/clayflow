[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidSurfaceMaterial

# Class: FluidSurfaceMaterial

Defined in: [elements/material/FluidSurfaceMaterial.ts:78](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/material/FluidSurfaceMaterial.ts#L78)

Material de água (spec 017) para corpos de partículas (`FluidBody`, e também `SoftBody`): o corpo é desenhado como uma
superfície contínua — não como esferas — com refração do que está atrás, absorção pela espessura, reflexão com
Fresnel e, sob a luz que projeta sombra, cáusticas no fundo e nos objetos submersos.

Desenhado pelos estágios da água (`FluidSurfaceFlow`, `CausticsFlow`, `WaterFlow`); não tem shader de forward (numa
`Geometry`, não é desenhado) e não projeta sombra: a água atenua a luz que passa, não a bloqueia.

    body.add(new FluidSurfaceMaterial({ absorption: [0.45, 0.09, 0.06, 0], caustics: true }));

## Extends

- [`Material`](Material.md)\<[`FluidSurfaceMaterialData`](../interfaces/FluidSurfaceMaterialData.md)\>

## Constructors

### Constructor

> **new FluidSurfaceMaterial**(`options?`): `FluidSurfaceMaterial`

Defined in: [elements/material/FluidSurfaceMaterial.ts:82](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/material/FluidSurfaceMaterial.ts#L82)

#### Parameters

##### options?

[`FluidSurfaceMaterialOptions`](../interfaces/FluidSurfaceMaterialOptions.md) = `{}`

#### Returns

`FluidSurfaceMaterial`

#### Overrides

[`Material`](Material.md).[`constructor`](Material.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/material/Material.ts:15](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/material/Material.ts#L15)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Material`](Material.md).[`state`](Material.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema` = `FluidSurfaceMaterialSchema`

Defined in: [elements/material/FluidSurfaceMaterial.ts:80](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/material/FluidSurfaceMaterial.ts#L80)

StructSchema do material de água (struct WGSL próprio).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L138)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`Material`](Material.md).[`attached`](Material.md#attached)

***

### castsShadow

#### Get Signature

> **get** **castsShadow**(): `boolean`

Defined in: [elements/material/Material.ts:30](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/material/Material.ts#L30)

Projeta sombra? Padrão: só triângulos (linhas e sprites não projetam). Atribuir antes de inserir na cena: a
escolha entra nos grupos de desenho na inserção.

##### Returns

`boolean`

#### Set Signature

> **set** **castsShadow**(`value`): `void`

Defined in: [elements/material/Material.ts:35](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/material/Material.ts#L35)

Define se o material projeta sombra (vale sobre o padrão da topologia).

##### Parameters

###### value

`boolean`

##### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`castsShadow`](Material.md#castsshadow)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`data`](Material.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Material`](Material.md).[`rawData`](Material.md#rawdata)

***

### topology

#### Get Signature

> **get** **topology**(): `GPUPrimitiveTopology`

Defined in: [elements/material/FluidSurfaceMaterial.ts:127](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/material/FluidSurfaceMaterial.ts#L127)

Topologia: pontos (o corpo é desenhado a partir das partículas).

##### Returns

`GPUPrimitiveTopology`

#### Overrides

[`Material`](Material.md).[`topology`](Material.md#topology)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L118)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`Material`](Material.md).[`add`](Material.md#add)

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L127)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Material`](Material.md).[`detach`](Material.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:110](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/material/FluidSurfaceMaterial.ts#L110)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Material`](Material.md).[`getDescriptors`](Material.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/material/FluidSurfaceMaterial.ts:122](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/material/FluidSurfaceMaterial.ts#L122)

Sem shader de forward: a superfície é desenhada pelos estágios da água.

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

[`Material`](Material.md).[`getPipelineDescriptors`](Material.md#getpipelinedescriptors)
