[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / ForwardSlots

# Interface: ForwardSlots

Defined in: [src/presentation/flows/ForwardFlow.ts:122](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L122)

Slots do render principal.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### antialiasing

> `readonly` **antialiasing**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L149)

Antisserrilhado da cena: o passe de movimento vale com o modo temporal.

***

### camera

> `readonly` **camera**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:124](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L124)

Câmera ativa: o seu slot em `cameras` vai nos parâmetros do quadro.

***

### cameraFunctions

> `readonly` **cameraFunctions**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/presentation/flows/ForwardFlow.ts:139](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L139)

Câmeras com `CameraFunction` (projeção de ponto da câmera ativa, spec 009).

***

### cameras

> `readonly` **cameras**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:126](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L126)

Pool `CameraMatrices` (grupo 0), produzido na GPU pelo estágio de câmera.

***

### diffs

> `readonly` **diffs**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:135](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L135)

Pool da geometria diferencial das superfícies (spec 010; opcional).

***

### light

> `readonly` **light**: [`TextureSlot`](../../platform/web/interfaces/TextureSlot.md)\<`true`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:147](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L147)

A luz que chega a cada pixel (`FrameTargets.light`, spec 034; sem MSAA): escrita pelo passe principal.

***

### motion

> `readonly` **motion**: [`TextureSlot`](../../platform/web/interfaces/TextureSlot.md)\<`true`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:145](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L145)

Vetores de movimento (`FrameTargets.motion`, spec 034; sem MSAA).

***

### refraction

> `readonly` **refraction**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:154](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L154)

Refração traçada (spec 034): com ela, os transmissivos marcam o pedido por pixel depois dos opacos (o traçado e a
composição desenham a cor deles); sem ela, não desenham.

***

### renderables

> `readonly` **renderables**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/presentation/flows/ForwardFlow.ts:133](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L133)

Entidades desenhadas (geometria + material + transform), com o registro `Renderable` e os grupos de instâncias
por (geometria, shader do material, orientação) mantidos pela C2.

***

### target

> `readonly` **target**: [`TargetSlot`](../../platform/web/interfaces/TargetSlot.md)

Defined in: [src/presentation/flows/ForwardFlow.ts:137](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L137)

Cor dos `FrameTargets` (com pós) ou o canvas; profundidade dos `FrameTargets`.

***

### targets

> `readonly` **targets**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:143](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L143)

Os alvos da cena (o passe de profundidade, spec 033; opcional).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:141](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L141)

Relógio da cena (tempo das funções `material`; opcional).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`ForwardWork`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:156](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L156)

O espaço de trabalho do passe: parâmetros do quadro, substituto da geometria diferencial, argumentos (spec 039).

***

### world

> `readonly` **world**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/presentation/flows/ForwardFlow.ts:128](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L128)

Pool `WorldTransform` (grupo 1, matriz de mundo pelo `transformSlot` do registro).
