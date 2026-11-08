[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / UiTree

# Class: UiTree

Defined in: [src/presentation/ui/UiTree.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/UiTree.ts#L8)

UiTree é o container raiz da hierarquia UI. UIFlow expõe via `app.defaults.ui.ui`
para o app adicionar elementos top-level. UiFlattener percorre `tree.root.children`
recursivamente para gerar quads por frame.

## Constructors

### Constructor

> **new UiTree**(): `UiTree`

#### Returns

`UiTree`

## Properties

### root

> `readonly` **root**: [`UiElement`](UiElement.md)

Defined in: [src/presentation/ui/UiTree.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/UiTree.ts#L10)

Raiz oculta (UiElement abstrato vazio). Filhos diretos são os top-level UI.

## Methods

### add()

> **add**(`element`): `this`

Defined in: [src/presentation/ui/UiTree.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/ui/UiTree.ts#L13)

Atalho — adiciona um elemento como filho da raiz. Chaining fluente.

#### Parameters

##### element

[`UiElement`](UiElement.md)

#### Returns

`this`
