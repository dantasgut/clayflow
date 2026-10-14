[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PresentationDefaultsOptions

# Interface: PresentationDefaultsOptions

Defined in: [presentation/flows/defaults.ts:17](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L17)

Dependências dos estágios padrão: o World da cena, onde entram os alvos do quadro (`FrameTargets`).

## Properties

### samples?

> `readonly` `optional` **samples?**: `1` \| `4`

Defined in: [presentation/flows/defaults.ts:21](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L21)

Amostras por pixel dos alvos da cena (MSAA; spec 008). Default 4.

***

### world

> `readonly` **world**: `World`

Defined in: [presentation/flows/defaults.ts:19](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L19)

World da cena.
