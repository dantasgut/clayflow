[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiVBox

# Class: UiVBox

Defined in: [presentation/ui/UiVBox.ts:7](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiVBox.ts#L7)

Container vertical: filhos empilhados de cima para baixo. Mesma semântica de
`UiHBox` (gap, padding, fixed-or-flex height).

## Extends

- [`UiElement`](UiElement.md)

## Constructors

### Constructor

> **new UiVBox**(): `UiVBox`

#### Returns

`UiVBox`

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

Defined in: [presentation/ui/UiVBox.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiVBox.ts#L8)

***

### padding

> **padding**: `number` = `0`

Defined in: [presentation/ui/UiVBox.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiVBox.ts#L9)

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

Defined in: [presentation/ui/UiVBox.ts:11](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiVBox.ts#L11)

#### Returns

`void`
