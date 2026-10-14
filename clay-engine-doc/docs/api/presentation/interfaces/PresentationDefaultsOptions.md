[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PresentationDefaultsOptions

# Interface: PresentationDefaultsOptions

Defined in: [presentation/flows/defaults.ts:21](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/defaults.ts#L21)

Dependências dos estágios padrão: o World da cena, onde entram os alvos do quadro (`FrameTargets`).

## Properties

### samples?

> `readonly` `optional` **samples?**: `1` \| `4`

Defined in: [presentation/flows/defaults.ts:25](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/defaults.ts#L25)

Amostras por pixel dos alvos da cena (MSAA; spec 008). Default 4.

***

### world

> `readonly` **world**: `World`

Defined in: [presentation/flows/defaults.ts:23](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/defaults.ts#L23)

World da cena.
