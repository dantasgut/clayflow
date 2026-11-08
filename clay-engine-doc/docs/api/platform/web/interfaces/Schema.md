[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / Schema

# Abstract Interface: Schema

Defined in: [src/scene/descriptors/Schema.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/Schema.ts#L11)

Schema é a base abstrata de todos os layouts de dados GPU. Subclasses
concretas:
  - `StructSchema`: struct com fields nomeados e tipos primitivos.
  - `TensorSchema`: tensor N-dimensional para densidade/grid data.

Todo Resource declara um (ou mais) Schemas via `getDescriptors()`. O
ResourceSystem usa Schema.stride para calcular byteSize do buffer e
Schema.pack para serializar `data` no upload.

## Extended by

- [`StructSchema`](../classes/StructSchema.md)

## Properties

### name

> `abstract` `readonly` **name**: `string`

Defined in: [src/scene/descriptors/Schema.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/Schema.ts#L16)

Nome do schema (e.g. 'Camera', 'Transform', 'BoxVertex'). Usado para
indexação em World.queryBySchemaName e como key em pool entries.

***

### stride

> `abstract` `readonly` **stride**: `number`

Defined in: [src/scene/descriptors/Schema.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/Schema.ts#L23)

Tamanho de uma instância em bytes (já alinhado).

***

### wgslName

> `abstract` `readonly` **wgslName**: `string`

Defined in: [src/scene/descriptors/Schema.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/Schema.ts#L21)

Tipo WGSL de um elemento — o nome do struct gerado (`StructSchema.wgslName`) ou o tipo do elemento de um
tensor. É o tipo que um binding `var<…> x: T` ou `array<T>` declara; o tipo do recurso declarado que lê o dado.

## Methods

### applyDefaults()

> `abstract` **applyDefaults**(`values`): `Record`\<`string`, `unknown`\>

Defined in: [src/scene/descriptors/Schema.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/Schema.ts#L30)

Preenche values ausentes em `values` com defaults sensíveis.

#### Parameters

##### values

`Record`\<`string`, `unknown`\>

#### Returns

`Record`\<`string`, `unknown`\>

***

### pack()

> `abstract` **pack**(`data`): `ArrayBufferView`

Defined in: [src/scene/descriptors/Schema.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/Schema.ts#L26)

Serializa `data` em ArrayBufferView com layout correto para o GPU.

#### Parameters

##### data

`Record`\<`string`, `unknown`\>

#### Returns

`ArrayBufferView`

***

### toWGSL()

> `abstract` **toWGSL**(): `string`

Defined in: [src/scene/descriptors/Schema.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/Schema.ts#L28)

Gera struct WGSL correspondente — concatena no shader source.

#### Returns

`string`
