[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / WireframeMaterial

# Class: WireframeMaterial

Defined in: [src/elements/material/WireframeMaterial.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/WireframeMaterial.ts#L26)

Material de arame (spec 008; o desenho do legado na arquitetura atual): desenha as **arestas da geometria** (descritor
`wireEdges`, em espaço de objeto — as de feição, sem as diagonais de faces planas) como linhas de `lineWidth` pixels,
com borda suavizada. Sem iluminação e sem sombra (`castsShadow` falso por padrão).

## Extends

- [`Material`](Material.md)\<[`WireframeMaterialData`](../interfaces/WireframeMaterialData.md)\>

## Constructors

### Constructor

> **new WireframeMaterial**(`values?`): `WireframeMaterial`

Defined in: [src/elements/material/WireframeMaterial.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/WireframeMaterial.ts#L30)

#### Parameters

##### values?

`Partial`\<`Pick`\<[`WireframeMaterialData`](../interfaces/WireframeMaterialData.md), `"color"` \| `"lineWidth"`\>\> = `{}`

#### Returns

`WireframeMaterial`

#### Overrides

[`Material`](Material.md).[`constructor`](Material.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/material/Material.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/Material.ts#L15)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Material`](Material.md).[`state`](Material.md#state)

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md) = `WireframeMaterialSchema`

Defined in: [src/elements/material/WireframeMaterial.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/WireframeMaterial.ts#L28)

StructSchema do WireframeMaterial (cor + espessura em pixels).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [src/scene/contracts/Entity.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L160)

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

Defined in: [src/elements/material/Material.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/Material.ts#L47)

Projeta sombra? Padrão: só triângulos (linhas e sprites não projetam). Atribuir antes de inserir na cena: a
escolha entra nos grupos de desenho na inserção.

##### Returns

`boolean`

#### Set Signature

> **set** **castsShadow**(`value`): `void`

Defined in: [src/elements/material/Material.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/Material.ts#L52)

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

Defined in: [src/scene/contracts/Entity.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L97)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [src/scene/contracts/Entity.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L103)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload. O tipo
concreto vem do parâmetro de `Entity<TData>`; o motor lê os campos pelo
schema.

#### Inherited from

[`Material`](Material.md).[`data`](Material.md#data)

***

### doubleSided

#### Get Signature

> **get** **doubleSided**(): `boolean`

Defined in: [src/elements/material/Material.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/Material.ts#L61)

Superfície de dois lados (tecido, folhas, paredes de espessura zero; spec 034, T061a): as faces de trás são
desenhadas (com a normal voltada para quem vê) e projetam sombra. Padrão: um lado só (as de trás descartadas).
Atribuir antes de inserir na cena: a escolha entra nos pipelines e nos grupos de desenho na inserção.

##### Returns

`boolean`

#### Set Signature

> **set** **doubleSided**(`value`): `void`

Defined in: [src/elements/material/Material.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/Material.ts#L66)

Define se o material é de dois lados.

##### Parameters

###### value

`boolean`

##### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`doubleSided`](Material.md#doublesided)

***

### drawsParticles

#### Get Signature

> **get** **drawsParticles**(): `boolean`

Defined in: [src/elements/material/Material.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/Material.ts#L39)

O material desenha corpos de partículas (sprites, superfície de água)? Um corpo de partículas com material que
não desenha corpos fica fora do desenho, com aviso. Padrão: não.

##### Returns

`boolean`

#### Inherited from

[`Material`](Material.md).[`drawsParticles`](Material.md#drawsparticles)

***

### family

#### Get Signature

> **get** **family**(): `string` \| `undefined`

Defined in: [src/elements/material/Material.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/Material.ts#L31)

Família de desenho (spec 031): o estágio que desenha as entidades com este material escolhe por ela (`surface`,
`points`, `wire`, `fluid-surface`…), sem conhecer outros tipos. Padrão: a do descritor de pipeline do material.

##### Returns

`string` \| `undefined`

#### Inherited from

[`Material`](Material.md).[`family`](Material.md#family)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [src/scene/contracts/Entity.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L117)

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

Defined in: [src/elements/material/Material.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/Material.ts#L23)

Topologia do desenho: a do descritor de pipeline do material (padrão `'triangle-list'`).

##### Returns

`GPUPrimitiveTopology`

#### Inherited from

[`Material`](Material.md).[`topology`](Material.md#topology)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [src/scene/contracts/Entity.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L140)

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

Defined in: [src/scene/contracts/Entity.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L149)

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

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/material/WireframeMaterial.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/WireframeMaterial.ts#L41)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Overrides

[`Material`](Material.md).[`getDescriptors`](Material.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/material/WireframeMaterial.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/material/WireframeMaterial.ts#L52)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Overrides

[`Material`](Material.md).[`getPipelineDescriptors`](Material.md#getpipelinedescriptors)

***

### redescribe()

> `protected` **redescribe**(`previous`, `next`): `void`

Defined in: [src/scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L127)

Troca o dado e os descritores em pool de uma vez — o Resource cujo layout depende do próprio dado (ex.: o registro
tipado de uma função de ponto quando a forma dos parâmetros muda; spec 031, R8). `getDescriptors()` já devolve os
novos; `previous` são os de antes. Fora da cena, só troca o dado; na cena, a C2 libera os slots nos pools antigos,
ocupa os dos novos com `next` e recompõe a entidade (`entitiesRecomposed`: registros e conjuntos dos estágios).

#### Parameters

##### previous

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

##### next

[`WireframeMaterialData`](../interfaces/WireframeMaterialData.md)

#### Returns

`void`

#### Inherited from

[`Material`](Material.md).[`redescribe`](Material.md#redescribe)
