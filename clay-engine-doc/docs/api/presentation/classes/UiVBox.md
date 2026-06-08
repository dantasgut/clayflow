[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiVBox

# Class: UiVBox

Defined in: [presentation/ui/UiVBox.ts:7](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiVBox.ts#L7)

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

### gap

> **gap**: `number` = `4`

Defined in: [presentation/ui/UiVBox.ts:9](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiVBox.ts#L9)

Espaço (px) entre filhos consecutivos. Default: 4.

***

### padding

> **padding**: `number` = `0`

Defined in: [presentation/ui/UiVBox.ts:11](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiVBox.ts#L11)

Padding interno (px) em todos os lados. Default: 0.

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

***

### layout()

> **layout**(): `void`

Defined in: [presentation/ui/UiVBox.ts:18](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/ui/UiVBox.ts#L18)

Recalcula bounds dos filhos. Filhos com `height > 0` mantêm tamanho
fixo; os demais dividem o espaço restante igualmente (flex). Chamar
sempre que filhos forem adicionados/removidos ou bounds do container mudar.

#### Returns

`void`
