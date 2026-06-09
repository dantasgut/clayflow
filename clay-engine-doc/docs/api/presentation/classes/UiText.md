[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiText

# Class: UiText

Defined in: [presentation/ui/UiText.ts:8](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiText.ts#L8)

Elemento de texto. UiTextLayout faz word-wrap dentro de `bounds.width`
(se >0) e gera glyph quads usando o atlas da `LoadedFont` setada em UIFlow.
Sem font setada via `UIFlow.setFont(...)`, UiText é skipado no flatten.

## Extends

- [`UiElement`](UiElement.md)

## Constructors

### Constructor

> **new UiText**(): `UiText`

#### Returns

`UiText`

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

### color

> **color**: readonly \[`number`, `number`, `number`, `number`\]

Defined in: [presentation/ui/UiText.ts:12](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiText.ts#L12)

Cor RGBA (multiplica com alpha do glyph atlas). Default branco.

***

### fontSize

> **fontSize**: `number` = `14`

Defined in: [presentation/ui/UiText.ts:14](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiText.ts#L14)

Tamanho da fonte em pixels (escala em relação ao atlas font size).

***

### text

> **text**: `string` = `''`

Defined in: [presentation/ui/UiText.ts:10](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/ui/UiText.ts#L10)

String a renderizar. Suporta `\n` para quebras explícitas.

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
