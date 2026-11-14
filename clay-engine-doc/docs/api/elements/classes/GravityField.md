[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / GravityField

# Class: GravityField

Defined in: [src/elements/physics/forcefields/GravityField.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/GravityField.ts#L35)

Campo gravitacional — uniforme (acceleration constante) ou point-source
(Newton: F = G·m·M/r²) conforme `sourceMode`. Aplicado a todos os physics
bodies pelo flow.

## Extends

- [`ForceField`](ForceField.md)\<[`GravityFieldData`](../interfaces/GravityFieldData.md)\>

## Constructors

### Constructor

> **new GravityField**(`values?`): `GravityField`

Defined in: [src/elements/physics/forcefields/GravityField.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/GravityField.ts#L50)

#### Parameters

##### values?

`Partial`\<[`GravityFieldData`](../interfaces/GravityFieldData.md)\> = `{}`

#### Returns

`GravityField`

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

Defined in: [src/elements/physics/forcefields/GravityField.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/GravityField.ts#L37)

StructSchema do GravityField (uniform de 64 bytes).

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

Defined in: [src/elements/physics/forcefields/GravityField.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/GravityField.ts#L82)

Fonte pontual (spec 009): atração G·M / r² para a posição da fonte; uniforme fica fora do laço.

#### Parameters

##### d

`Readonly`\<[`GravityFieldData`](../interfaces/GravityFieldData.md)\>

#### Returns

[`FieldRecordValues`](../interfaces/FieldRecordValues.md)

#### Overrides

[`ForceField`](ForceField.md).[`fieldRecord`](ForceField.md#fieldrecord)

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/physics/forcefields/GravityField.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/GravityField.ts#L66)

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

[`GravityFieldData`](../interfaces/GravityFieldData.md)

#### Returns

`void`

#### Inherited from

[`ForceField`](ForceField.md).[`redescribe`](ForceField.md#redescribe)

***

### uniformAcceleration()

> **uniformAcceleration**(): readonly `number`[]

Defined in: [src/elements/physics/forcefields/GravityField.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/GravityField.ts#L77)

Gravidade uniforme que os solvers somam (m/s²): `acceleration`, ou zero com fonte pontual (`sourceMode = 1`) —
aí a atração vem do registro do campo (ponto `field`, spec 009).

#### Returns

readonly `number`[]

***

### withRecord()

> `protected` **withRecord**(`data`): [`GravityFieldData`](../interfaces/GravityFieldData.md)

Defined in: [src/elements/physics/forcefields/ForceField.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/forcefields/ForceField.ts#L70)

`data` com os campos do registro `FieldBuiltinRecord` (`a`, `b`, `s`, `kind`) como getters derivados de
`fieldRecord` — o envio do pool lê os valores atuais.

#### Parameters

##### data

[`GravityFieldData`](../interfaces/GravityFieldData.md)

#### Returns

[`GravityFieldData`](../interfaces/GravityFieldData.md)

#### Inherited from

[`ForceField`](ForceField.md).[`withRecord`](ForceField.md#withrecord)
