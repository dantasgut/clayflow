[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / WindField

# Class: WindField

Defined in: [src/elements/physics/forcefields/WindField.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/WindField.ts#L24)

Campo de vento — força direcional + turbulence noise sobre todos os
physics bodies. Útil para folhas, panos, partículas atmosféricas.

## Extends

- [`ForceField`](ForceField.md)\<[`WindFieldData`](../interfaces/WindFieldData.md)\>

## Constructors

### Constructor

> **new WindField**(`values?`): `WindField`

Defined in: [src/elements/physics/forcefields/WindField.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/WindField.ts#L34)

#### Parameters

##### values?

`Partial`\<[`WindFieldData`](../interfaces/WindFieldData.md)\> = `{}`

#### Returns

`WindField`

#### Overrides

[`ForceField`](ForceField.md).[`constructor`](ForceField.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/physics/forcefields/ForceField.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/ForceField.ts#L46)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ForceField`](ForceField.md).[`state`](ForceField.md#state)

***

### recordDescriptor

> `protected` `readonly` `static` **recordDescriptor**: [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)

Defined in: [src/elements/physics/forcefields/ForceField.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/ForceField.ts#L49)

Descritor do registro no pool dos campos prontos (slot zerado na saída: `kind` 0, fora do laço).

#### Inherited from

[`ForceField`](ForceField.md).[`recordDescriptor`](ForceField.md#recorddescriptor)

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/physics/forcefields/WindField.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/WindField.ts#L26)

StructSchema do WindField (direction+magnitude+turbulence).

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

[`ForceField`](ForceField.md).[`attached`](ForceField.md#attached)

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

[`ForceField`](ForceField.md).[`data`](ForceField.md#data)

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

[`ForceField`](ForceField.md).[`rawData`](ForceField.md#rawdata)

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

[`ForceField`](ForceField.md).[`add`](ForceField.md#add)

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

[`ForceField`](ForceField.md).[`detach`](ForceField.md#detach)

***

### fieldRecord()

> `protected` **fieldRecord**(`d`): [`FieldRecordValues`](../interfaces/FieldRecordValues.md)

Defined in: [src/elements/physics/forcefields/WindField.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/WindField.ts#L50)

Vento (spec 009): aceleração na direção (normalizada) vezes a intensidade, com rajadas pela turbulência.

#### Parameters

##### d

`Readonly`\<[`WindFieldData`](../interfaces/WindFieldData.md)\>

#### Returns

[`FieldRecordValues`](../interfaces/FieldRecordValues.md)

#### Overrides

[`ForceField`](ForceField.md).[`fieldRecord`](ForceField.md#fieldrecord)

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/physics/forcefields/WindField.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/WindField.ts#L45)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Overrides

[`ForceField`](ForceField.md).[`getDescriptors`](ForceField.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/physics/forcefields/ForceField.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/ForceField.ts#L59)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Inherited from

[`ForceField`](ForceField.md).[`getPipelineDescriptors`](ForceField.md#getpipelinedescriptors)

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

[`WindFieldData`](../interfaces/WindFieldData.md)

#### Returns

`void`

#### Inherited from

[`ForceField`](ForceField.md).[`redescribe`](ForceField.md#redescribe)

***

### withRecord()

> `protected` **withRecord**(`data`): [`WindFieldData`](../interfaces/WindFieldData.md)

Defined in: [src/elements/physics/forcefields/ForceField.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/ForceField.ts#L70)

`data` com os campos do registro `FieldBuiltinRecord` (`a`, `b`, `s`, `kind`) como getters derivados de
`fieldRecord` — o envio do pool lê os valores atuais.

#### Parameters

##### data

[`WindFieldData`](../interfaces/WindFieldData.md)

#### Returns

[`WindFieldData`](../interfaces/WindFieldData.md)

#### Inherited from

[`ForceField`](ForceField.md).[`withRecord`](ForceField.md#withrecord)
