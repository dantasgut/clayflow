[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PreparedCompute

# Interface: PreparedCompute

Defined in: [src/scene/flows/FlowBinding.ts:137](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L137)

Pipeline de compute preparado pela C2.

## Extends

- `PreparedBase`

## Properties

### descriptor

> `readonly` **descriptor**: [`PipelineDescriptor`](PipelineDescriptor.md)

Defined in: [src/scene/flows/FlowBinding.ts:67](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L67)

Descritor de origem.

#### Inherited from

`PreparedBase.descriptor`

***

### dynamic

> `readonly` **dynamic**: readonly `boolean`[]

Defined in: [src/scene/flows/FlowBinding.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L76)

`dynamic[g]`: o grupo `g` tem bindings com offset dinâmico — o `setBindGroup` leva os offsets.

#### Inherited from

`PreparedBase.dynamic`

***

### groups

> `readonly` **groups**: readonly [`BindGroupSpec`](BindGroupSpec.md)[]

Defined in: [src/scene/flows/FlowBinding.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L74)

Bind groups atuais, um por `@group` (o índice é o do grupo). A C2 os substitui quando uma fonte é recriada
(`bindGroupReplaced`); leia a cada gravação, não guarde.

#### Inherited from

`PreparedBase.groups`

***

### id

> `readonly` **id**: `string`

Defined in: [src/scene/flows/FlowBinding.ts:65](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L65)

Id do descritor (ou do pipeline preparado em transição).

#### Inherited from

`PreparedBase.id`

***

### layout

> `readonly` **layout**: [`InferredLayout`](InferredLayout.md)

Defined in: [src/scene/flows/FlowBinding.ts:69](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L69)

Layout inferido do WGSL montado.

#### Inherited from

`PreparedBase.layout`

***

### ready

> `readonly` **ready**: `boolean`

Defined in: [src/scene/flows/FlowBinding.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L78)

Compilado e pronto para gravar.

#### Inherited from

`PreparedBase.ready`

***

### role

> `readonly` **role**: `"compute"`

Defined in: [src/scene/flows/FlowBinding.ts:139](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L139)

Papel do pipeline.

***

### spec

> `readonly` **spec**: [`ComputePipelineSpec`](ComputePipelineSpec.md)

Defined in: [src/scene/flows/FlowBinding.ts:141](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L141)

Spec compilado (para `setPipeline`).

## Methods

### bindTo()

> **bindTo**\<`P`\>(`binder`, `offsets?`): `void`

Defined in: [src/scene/flows/FlowBinding.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L89)

Grava todos os grupos (spec 031): `setBindGroup(índice, grupo, offsets)` para cada grupo, com os offsets da
frequência do grupo quando ele é dinâmico.

#### Type Parameters

##### P

`P` *extends* `PipelineSpec`

#### Parameters

##### binder

`Binder`\<`P`\>

##### offsets?

`Readonly`\<`Partial`\<`Record`\<[`BindingFrequency`](../type-aliases/BindingFrequency.md), readonly `number`[]\>\>\>

#### Returns

`void`

#### Throws

Error se um grupo dinâmico não tem offsets em `offsets`.

#### Inherited from

`PreparedBase.bindTo`

***

### groupsOf()

> **groupsOf**(`frequency`): readonly [`PreparedGroup`](PreparedGroup.md)[]

Defined in: [src/scene/flows/FlowBinding.ts:83](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L83)

Grupos de uma frequência (spec 031): o estágio grava `setBindGroup(g.index, g.spec, …)` para a frequência que
mudou, sem índices escritos no código.

#### Parameters

##### frequency

[`BindingFrequency`](../type-aliases/BindingFrequency.md)

#### Returns

readonly [`PreparedGroup`](PreparedGroup.md)[]

#### Inherited from

`PreparedBase.groupsOf`
