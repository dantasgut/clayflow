[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BoundFlow

# Interface: BoundFlow\<TSlots\>

Defined in: [src/scene/flows/FlowBinding.ts:156](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L156)

O que o `dispatch` recebe: slots resolvidos e pipelines preparados.

## Type Parameters

### TSlots

`TSlots` *extends* [`SlotMap`](../type-aliases/SlotMap.md) = [`SlotMap`](../type-aliases/SlotMap.md)

## Properties

### pipelines

> `readonly` **pipelines**: `ReadonlyMap`\<`string`, [`PreparedPipeline`](../type-aliases/PreparedPipeline.md)\>

Defined in: [src/scene/flows/FlowBinding.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L160)

Pipelines preparados por id (declarados e preparados em transições).

***

### slots

> `readonly` **slots**: [`BoundSlots`](../type-aliases/BoundSlots.md)\<`TSlots`\>

Defined in: [src/scene/flows/FlowBinding.ts:158](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L158)

Slots resolvidos, por nome (opcionais ausentes são `undefined`).

## Methods

### compute()

> **compute**(`id`): [`PreparedCompute`](PreparedCompute.md)

Defined in: [src/scene/flows/FlowBinding.ts:165](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L165)

Pipeline de compute `id`.

#### Parameters

##### id

`string`

#### Returns

[`PreparedCompute`](PreparedCompute.md)

#### Throws

Error se não existe ou não é de compute.

***

### render()

> **render**(`id`): [`PreparedRender`](PreparedRender.md)

Defined in: [src/scene/flows/FlowBinding.ts:170](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L170)

Pipeline de render `id`.

#### Parameters

##### id

`string`

#### Returns

[`PreparedRender`](PreparedRender.md)

#### Throws

Error se não existe ou não é de render.
