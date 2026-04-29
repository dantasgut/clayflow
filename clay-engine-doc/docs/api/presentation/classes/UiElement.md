[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiElement

# Abstract Class: UiElement

Defined in: [presentation/ui/UiElement.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiElement.ts#L8)

## Extended by

- [`UiPanel`](UiPanel.md)
- [`UiText`](UiText.md)
- [`UiButton`](UiButton.md)
- [`UiSlider`](UiSlider.md)
- [`UiHBox`](UiHBox.md)
- [`UiVBox`](UiVBox.md)
- [`UiStack`](UiStack.md)

## Constructors

### Constructor

> **new UiElement**(): `UiElement`

#### Returns

`UiElement`

## Properties

### bounds

> **bounds**: [`UiBounds`](../interfaces/UiBounds.md)

Defined in: [presentation/ui/UiElement.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiElement.ts#L9)

***

### children

> **children**: `UiElement`[] = `[]`

Defined in: [presentation/ui/UiElement.ts:11](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiElement.ts#L11)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [presentation/ui/UiElement.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiElement.ts#L10)

## Methods

### add()

> **add**(`child`): `this`

Defined in: [presentation/ui/UiElement.ts:13](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiElement.ts#L13)

#### Parameters

##### child

`UiElement`

#### Returns

`this`
