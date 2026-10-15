[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PresentationDefaultsOptions

# Interface: PresentationDefaultsOptions

Defined in: [presentation/flows/defaults.ts:23](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/defaults.ts#L23)

Dependências dos estágios padrão: o World da cena, onde entram os alvos do quadro (`FrameTargets`).

## Properties

### samples?

> `readonly` `optional` **samples?**: `1` \| `4`

Defined in: [presentation/flows/defaults.ts:27](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/defaults.ts#L27)

Amostras por pixel dos alvos da cena (MSAA; spec 008). Default 4.

***

### world

> `readonly` **world**: `World`

Defined in: [presentation/flows/defaults.ts:25](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/defaults.ts#L25)

World da cena.
