[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiInteractionHandler

# Class: UiInteractionHandler

Defined in: [presentation/ui/UiInteractionHandler.ts:15](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiInteractionHandler.ts#L15)

Acopla pointer events de um canvas a um UiTree, suportando hover, click, e
drag em UiSlider. Hit-test percorre a árvore de fora-pra-dentro respeitando
`visible` e usa coordenadas do canvas (CSS px → coordenadas absolutas com
devicePixelRatio aplicado, casando com `bounds` em UiElement).

Uso: `const h = new UiInteractionHandler(tree, canvas); h.attach();`
Detach via `h.detach()`. Idempotente para attach/detach repetidos.

## Constructors

### Constructor

> **new UiInteractionHandler**(`tree`, `canvas`): `UiInteractionHandler`

Defined in: [presentation/ui/UiInteractionHandler.ts:21](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiInteractionHandler.ts#L21)

#### Parameters

##### tree

[`UiTree`](UiTree.md)

##### canvas

`HTMLCanvasElement`

#### Returns

`UiInteractionHandler`

## Methods

### attach()

> **attach**(): `void`

Defined in: [presentation/ui/UiInteractionHandler.ts:26](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiInteractionHandler.ts#L26)

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/ui/UiInteractionHandler.ts:35](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/ui/UiInteractionHandler.ts#L35)

#### Returns

`void`
