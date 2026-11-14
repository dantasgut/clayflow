[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / UiInteractionHandler

# Class: UiInteractionHandler

Defined in: [src/platform/web/ui/UiInteractionHandler.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/ui/UiInteractionHandler.ts#L15)

Acopla pointer events de um canvas a um UiTree, suportando hover, click, e
drag em UiSlider. Hit-test percorre a árvore de fora-pra-dentro respeitando
`visible` e usa coordenadas do canvas (CSS px → coordenadas absolutas com
devicePixelRatio aplicado, casando com `bounds` em UiElement).

Uso: `const h = new UiInteractionHandler(tree, canvas); h.attach();`
Detach via `h.detach()`. Idempotente para attach/detach repetidos.

## Constructors

### Constructor

> **new UiInteractionHandler**(`tree`, `canvas`): `UiInteractionHandler`

Defined in: [src/platform/web/ui/UiInteractionHandler.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/ui/UiInteractionHandler.ts#L21)

#### Parameters

##### tree

[`UiTree`](../../../presentation/classes/UiTree.md)

##### canvas

`HTMLCanvasElement`

#### Returns

`UiInteractionHandler`

## Methods

### attach()

> **attach**(): `void`

Defined in: [src/platform/web/ui/UiInteractionHandler.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/ui/UiInteractionHandler.ts#L27)

Liga listeners de pointer ao canvas. Idempotente.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [src/platform/web/ui/UiInteractionHandler.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/ui/UiInteractionHandler.ts#L37)

Remove listeners e limpa estado de hover/press/drag. Idempotente.

#### Returns

`void`
