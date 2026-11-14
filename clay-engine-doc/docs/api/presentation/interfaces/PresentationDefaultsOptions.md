[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / PresentationDefaultsOptions

# Interface: PresentationDefaultsOptions

Defined in: [src/presentation/flows/defaults.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L54)

Dependências dos estágios padrão: o World da cena, onde entram os alvos do quadro (`FrameTargets`).

## Properties

### antialiasing?

> `readonly` `optional` **antialiasing?**: [`AntialiasingMode`](../../elements/type-aliases/AntialiasingMode.md)

Defined in: [src/presentation/flows/defaults.ts:65](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L65)

Modo do antisserrilhado da cena (spec 034). Default `'temporal'`.

***

### events?

> `readonly` `optional` **events?**: [`EventBus`](../../platform/web/interfaces/EventBus.md)

Defined in: [src/presentation/flows/defaults.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L61)

Eventos da cena: com eles, a entrada de uma `GlobalIllumination` retira o hemisfério (e garante a `RayScene`) e a
saída da última o devolve (spec 033, R7).

***

### samples?

> `readonly` `optional` **samples?**: `1` \| `4`

Defined in: [src/presentation/flows/defaults.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L63)

Amostras por pixel dos alvos da cena (MSAA; spec 008). Default 4.

***

### world

> `readonly` **world**: [`World`](../../platform/web/classes/World.md)

Defined in: [src/presentation/flows/defaults.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L56)

World da cena.
