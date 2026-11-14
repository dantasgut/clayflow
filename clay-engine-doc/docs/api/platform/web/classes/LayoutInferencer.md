[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / LayoutInferencer

# Class: LayoutInferencer

Defined in: [src/scene/systems/LayoutInferencer.ts:126](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L126)

Inferência de layout da Camada 2 a partir do WGSL montado (`composeWgsl`): grupos, bindings, tipo de cada recurso
e visibilidade. A visibilidade de um binding é a união dos estágios das entradas que **alcançam** — por chamadas
transitivas entre funções de módulo — uma função que cita a variável; usar a variável só numa função auxiliar
conta. É a base da ligação feita pela C2 (`flowBinding`): o estágio nunca escreve layouts à mão.

Os bindings vêm só das declarações de recursos do shader montado (`ComposedShader.bindings`, spec 031); do fonte
(sem comentários) varre só as funções de módulo, e os corpos pelo casamento de chaves, para a visibilidade.

## Constructors

### Constructor

> **new LayoutInferencer**(): `LayoutInferencer`

#### Returns

`LayoutInferencer`

## Methods

### infer()

> **infer**(`shader`, `entryPoints`): [`InferredLayout`](../interfaces/InferredLayout.md)

Defined in: [src/scene/systems/LayoutInferencer.ts:135](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L135)

Layout das entradas `entryPoints` de um shader montado: só os bindings usados por elas, com visibilidade dos
estágios delas. Grupos sem uso entre 0 e o maior grupo usado aparecem vazios (o índice do `@group` é o índice
do layout no pipeline).

#### Parameters

##### shader

[`ComposedShader`](../interfaces/ComposedShader.md)

##### entryPoints

readonly `string`[]

#### Returns

[`InferredLayout`](../interfaces/InferredLayout.md)

#### Throws

LayoutInferenceError se uma entrada não é função de entrada do fonte, ou se o tipo de um binding usado
  não é ligável (ex.: `texture_external`).
