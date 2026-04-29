[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiHBox

# Class: UiHBox

Defined in: [presentation/ui/UiHBox.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiHBox.ts#L9)

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

Defined in: [presentation/ui/UiElement.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiElement.ts#L9)

#### Inherited from

[`UiElement`](UiElement.md).[`bounds`](UiElement.md#bounds)

***

### children

> **children**: [`UiElement`](UiElement.md)[] = `[]`

Defined in: [presentation/ui/UiElement.ts:11](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiElement.ts#L11)

#### Inherited from

[`UiElement`](UiElement.md).[`children`](UiElement.md#children)

***

### gap

> **gap**: `number` = `4`

Defined in: [presentation/ui/UiHBox.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiHBox.ts#L10)

***

### padding

> **padding**: `number` = `0`

Defined in: [presentation/ui/UiHBox.ts:11](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiHBox.ts#L11)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [presentation/ui/UiElement.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiElement.ts#L10)

#### Inherited from

[`UiElement`](UiElement.md).[`visible`](UiElement.md#visible)

## Methods

### add()

> **add**(`child`): `this`

Defined in: [presentation/ui/UiElement.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiElement.ts#L13)

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

Defined in: [presentation/ui/UiHBox.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiHBox.ts#L13)

#### Returns

`void`
