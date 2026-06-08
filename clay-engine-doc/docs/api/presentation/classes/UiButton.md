[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiButton

# Class: UiButton

Defined in: [presentation/ui/UiButton.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiButton.ts#L8)

Botão clicável. UiInteractionHandler atualiza `hovered`/`pressed` baseado
em pointer events (intersect bounds). UiFlattener gera quad com cor
variando por estado: idle / hovered / pressed.

## Extends

- [`UiElement`](UiElement.md)

## Constructors

### Constructor

> **new UiButton**(): `UiButton`

#### Returns

`UiButton`

#### Inherited from

[`UiElement`](UiElement.md).[`constructor`](UiElement.md#constructor)

## Properties

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

### hovered

> **hovered**: `boolean` = `false`

Defined in: [presentation/ui/UiButton.ts:12](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiButton.ts#L12)

True se cursor está sobre o button (atualizado por UiInteractionHandler).

***

### label

> **label**: `string` = `''`

Defined in: [presentation/ui/UiButton.ts:10](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiButton.ts#L10)

Texto exibido (não renderizado pelo button — adicione UiText filho se quiser label).

***

### onClick

> **onClick**: (() => `void`) \| `undefined`

Defined in: [presentation/ui/UiButton.ts:16](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiButton.ts#L16)

Callback chamado em click (pointerup dentro de bounds após pointerdown nele).

***

### pressed

> **pressed**: `boolean` = `false`

Defined in: [presentation/ui/UiButton.ts:14](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiButton.ts#L14)

True enquanto o botão está mouse-down (após pointerdown, antes de pointerup).

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
