[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UiInteractionHandler

# Class: UiInteractionHandler

Defined in: [presentation/ui/UiInteractionHandler.ts:15](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/ui/UiInteractionHandler.ts#L15)

Acopla pointer events de um canvas a um UiTree, suportando hover, click, e
drag em UiSlider. Hit-test percorre a árvore de fora-pra-dentro respeitando
`visible` e usa coordenadas do canvas (CSS px → coordenadas absolutas com
devicePixelRatio aplicado, casando com `bounds` em UiElement).

Uso: `const h = new UiInteractionHandler(tree, canvas); h.attach();`
Detach via `h.detach()`. Idempotente para attach/detach repetidos.

## Constructors

### Constructor

> **new UiInteractionHandler**(`tree`, `canvas`): `UiInteractionHandler`

Defined in: [presentation/ui/UiInteractionHandler.ts:21](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/ui/UiInteractionHandler.ts#L21)

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

Defined in: [presentation/ui/UiInteractionHandler.ts:27](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/ui/UiInteractionHandler.ts#L27)

Liga listeners de pointer ao canvas. Idempotente.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/ui/UiInteractionHandler.ts:37](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/ui/UiInteractionHandler.ts#L37)

Remove listeners e limpa estado de hover/press/drag. Idempotente.

#### Returns

`void`
