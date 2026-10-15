[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PostSlots

# Interface: PostSlots

Defined in: [presentation/flows/PostFlow.ts:22](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/PostFlow.ts#L22)

Slots do pós-processamento.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### scene

> `readonly` **scene**: `TextureSlot`\<`false`\>

Defined in: [presentation/flows/PostFlow.ts:24](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/PostFlow.ts#L24)

Cor da cena desenhada pelo render principal (`FrameTargets.color`).

***

### target

> `readonly` **target**: `TargetSlot`

Defined in: [presentation/flows/PostFlow.ts:26](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/PostFlow.ts#L26)

O canvas do quadro (último passe da cadeia).
