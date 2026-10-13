[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PostSlots

# Interface: PostSlots

Defined in: [presentation/flows/PostFlow.ts:22](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/flows/PostFlow.ts#L22)

Slots do pós-processamento.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### scene

> `readonly` **scene**: `TextureSlot`\<`false`\>

Defined in: [presentation/flows/PostFlow.ts:24](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/flows/PostFlow.ts#L24)

Cor da cena desenhada pelo render principal (`FrameTargets.color`).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/PostFlow.ts:26](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/flows/PostFlow.ts#L26)

O canvas do quadro (último passe da cadeia).
