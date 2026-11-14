[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WorkKernel

# Interface: WorkKernel

Defined in: [src/scene/flows/FlowWork.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L52)

Um kernel de compute de uma parte do trabalho (`WorkPipelines.kernel`).

## Properties

### bindings

> `readonly` **bindings**: [`BindingSources`](../type-aliases/BindingSources.md)

Defined in: [src/scene/flows/FlowWork.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L60)

As fontes privadas do kernel, por recurso declarado (uma chave por pipeline vale pelo recurso dela).

***

### constants?

> `readonly` `optional` **constants?**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/scene/flows/FlowWork.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L62)

Constantes `override` do shader.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [src/scene/flows/FlowWork.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L54)

Prefixo do id (o da instância da parte).

***

### entryPoint

> `readonly` **entryPoint**: `string`

Defined in: [src/scene/flows/FlowWork.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L58)

A função `@compute` do módulo.

***

### shader

> `readonly` **shader**: [`WgslModule`](WgslModule.md)

Defined in: [src/scene/flows/FlowWork.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L56)

Módulo de entrada (montado pela C2).
