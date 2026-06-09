[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiStack

# Class: UiStack

Defined in: [presentation/ui/UiStack.ts:7](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiStack.ts#L7)

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

### padding

> **padding**: `number` = `0`

Defined in: [presentation/ui/UiStack.ts:9](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiStack.ts#L9)

Inset uniforme em todos os lados do container (CSS px). Default: 0.

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

Defined in: [presentation/ui/UiStack.ts:12](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiStack.ts#L12)

Recalcula `bounds` de cada filho (todos ocupam a área do stack menos padding).

#### Returns

`void`
