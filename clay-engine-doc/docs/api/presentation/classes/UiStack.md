[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiStack

# Class: UiStack

Defined in: [presentation/ui/UiStack.ts:7](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiStack.ts#L7)

Container Z-stack: cada filho ocupa a área inteira do parent (menos padding),
sobreposto por ordem de inserção. Útil para HUDs (background + overlay).

## Extends

- [`UiElement`](UiElement.md)

## Constructors

### Constructor

> **new UiStack**(): `UiStack`

#### Returns

`UiStack`

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

### padding

> **padding**: `number` = `0`

Defined in: [presentation/ui/UiStack.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiStack.ts#L8)

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

Defined in: [presentation/ui/UiStack.ts:10](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiStack.ts#L10)

#### Returns

`void`
