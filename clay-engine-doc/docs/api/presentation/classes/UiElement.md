[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiElement

# Abstract Class: UiElement

Defined in: [presentation/ui/UiElement.ts:25](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiElement.ts#L25)

UiElement é a base de todos os elementos UI (Panel, Button, Slider, Text).
Composição via árvore — cada elemento tem `bounds` próprios e `children`
renderizados por cima. UIFlow + UiFlattener percorrem essa árvore para
gerar `UiQuadCpu[]` enviados ao GPU pelo UiGpuPipeline.

Subclasses concretas: UiPanel, UiButton, UiSlider, UiText, UiHBox, UiVBox.
Layout (HBox/VBox) calcula bounds dos filhos automaticamente.

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

Defined in: [presentation/ui/UiElement.ts:27](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiElement.ts#L27)

Posição + tamanho em pixels de tela. Setado pelo layout ou manualmente.

***

### children

> **children**: `UiElement`[] = `[]`

Defined in: [presentation/ui/UiElement.ts:31](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiElement.ts#L31)

Filhos diretos. Renderizados após o pai (z-order natural).

***

### visible

> **visible**: `boolean` = `true`

Defined in: [presentation/ui/UiElement.ts:29](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiElement.ts#L29)

Quando false, o elemento e seus filhos não são renderizados.

## Methods

### add()

> **add**(`child`): `this`

Defined in: [presentation/ui/UiElement.ts:34](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiElement.ts#L34)

Anexa um UiElement filho. Chaining fluente.

#### Parameters

##### child

`UiElement`

#### Returns

`this`
