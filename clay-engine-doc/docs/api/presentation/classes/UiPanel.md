[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiPanel

# Class: UiPanel

Defined in: [presentation/ui/UiPanel.ts:7](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiPanel.ts#L7)

Painel — retângulo colorido na UI. Container conceitual para outros
elements via `parts` (composição via Entity).

## Extends

- [`UiElement`](UiElement.md)

## Constructors

### Constructor

> **new UiPanel**(): `UiPanel`

#### Returns

`UiPanel`

#### Inherited from

[`UiElement`](UiElement.md).[`constructor`](UiElement.md#constructor)

## Properties

### background

> **background**: readonly \[`number`, `number`, `number`, `number`\]

Defined in: [presentation/ui/UiPanel.ts:9](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiPanel.ts#L9)

Cor de fundo RGBA (premultiplied alpha). Default: 50% black.

***

### bounds

> **bounds**: [`UiBounds`](../interfaces/UiBounds.md)

Defined in: [presentation/ui/UiElement.ts:27](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiElement.ts#L27)

Posição + tamanho em pixels de tela. Setado pelo layout ou manualmente.

#### Inherited from

[`UiElement`](UiElement.md).[`bounds`](UiElement.md#bounds)

***

### children

> **children**: [`UiElement`](UiElement.md)[] = `[]`

Defined in: [presentation/ui/UiElement.ts:31](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiElement.ts#L31)

Filhos diretos. Renderizados após o pai (z-order natural).

#### Inherited from

[`UiElement`](UiElement.md).[`children`](UiElement.md#children)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [presentation/ui/UiElement.ts:29](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiElement.ts#L29)

Quando false, o elemento e seus filhos não são renderizados.

#### Inherited from

[`UiElement`](UiElement.md).[`visible`](UiElement.md#visible)

## Methods

### add()

> **add**(`child`): `this`

Defined in: [presentation/ui/UiElement.ts:34](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiElement.ts#L34)

Anexa um UiElement filho. Chaining fluente.

#### Parameters

##### child

[`UiElement`](UiElement.md)

#### Returns

`this`

#### Inherited from

[`UiElement`](UiElement.md).[`add`](UiElement.md#add)
