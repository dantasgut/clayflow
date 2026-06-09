[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiHBox

# Class: UiHBox

Defined in: [presentation/ui/UiHBox.ts:9](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiHBox.ts#L9)

Container que arruma filhos lado-a-lado horizontalmente, com `gap` entre eles
e `padding` interno. O layout é aplicado em `UiHBox.layout()` que computa os
`bounds` de cada filho a partir de `bounds` próprio. Filhos com `width=0`
recebem largura distribuída (flex). Filhos com width>0 são `fixed`.

## Extends

- [`UiElement`](UiElement.md)

## Constructors

### Constructor

> **new UiHBox**(): `UiHBox`

#### Returns

`UiHBox`

#### Inherited from

[`UiElement`](UiElement.md).[`constructor`](UiElement.md#constructor)

## Properties

### bounds

> **bounds**: [`UiBounds`](../interfaces/UiBounds.md)

Defined in: [presentation/ui/UiElement.ts:27](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiElement.ts#L27)

Posição + tamanho em pixels de tela. Setado pelo layout ou manualmente.

#### Inherited from

[`UiElement`](UiElement.md).[`bounds`](UiElement.md#bounds)

***

### children

> **children**: [`UiElement`](UiElement.md)[] = `[]`

Defined in: [presentation/ui/UiElement.ts:31](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiElement.ts#L31)

Filhos diretos. Renderizados após o pai (z-order natural).

#### Inherited from

[`UiElement`](UiElement.md).[`children`](UiElement.md#children)

***

### gap

> **gap**: `number` = `4`

Defined in: [presentation/ui/UiHBox.ts:11](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiHBox.ts#L11)

Espaço (px) entre filhos consecutivos. Default: 4.

***

### padding

> **padding**: `number` = `0`

Defined in: [presentation/ui/UiHBox.ts:13](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiHBox.ts#L13)

Padding interno (px) em todos os lados. Default: 0.

***

### visible

> **visible**: `boolean` = `true`

Defined in: [presentation/ui/UiElement.ts:29](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiElement.ts#L29)

Quando false, o elemento e seus filhos não são renderizados.

#### Inherited from

[`UiElement`](UiElement.md).[`visible`](UiElement.md#visible)

## Methods

### add()

> **add**(`child`): `this`

Defined in: [presentation/ui/UiElement.ts:34](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiElement.ts#L34)

Anexa um UiElement filho. Chaining fluente.

#### Parameters

##### child

[`UiElement`](UiElement.md)

#### Returns

`this`

#### Inherited from

[`UiElement`](UiElement.md).[`add`](UiElement.md#add)

***

### layout()

> **layout**(): `void`

Defined in: [presentation/ui/UiHBox.ts:16](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiHBox.ts#L16)

Recalcula bounds dos filhos (fixed-width preservado, flex divide o resto).

#### Returns

`void`
