[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / ToneMappingOptions

# Interface: ToneMappingOptions

Defined in: [src/presentation/resources/ToneMapping.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/ToneMapping.ts#L16)

Opções da apresentação.

## Properties

### dither?

> `readonly` `optional` **dither?**: `boolean`

Defined in: [src/presentation/resources/ToneMapping.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/ToneMapping.ts#L25)

Pontilhamento de ±1 nível de código na saída de 8 bits, contra faixas. Default `true`.

***

### exposure?

> `readonly` `optional` **exposure?**: `number`

Defined in: [src/presentation/resources/ToneMapping.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/ToneMapping.ts#L23)

Exposição em EV, como numa câmera: 0 = ×1, +1 dobra a luz. Default 0.

***

### operator?

> `readonly` `optional` **operator?**: [`ToneOperator`](../type-aliases/ToneOperator.md)

Defined in: [src/presentation/resources/ToneMapping.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/ToneMapping.ts#L21)

Operador: `agx` (default, o do Blender 4 — preserva a matiz em realces saturados), `aces` (ajuste de Hill),
`neutral` (Khronos PBR Neutral — identidade até ~0,76) ou `linear` (sem compressão, para depuração).

***

### output?

> `readonly` `optional` **output?**: [`PresentationOutput`](../type-aliases/PresentationOutput.md)

Defined in: [src/presentation/resources/ToneMapping.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/resources/ToneMapping.ts#L31)

`sdr` (default) ou `hdr`: com navegador e tela que suportam, o canvas passa a `rgba16float` com mapeamento de
tons estendido e os valores acima do branco de referência chegam à tela (a exposição vale; o operador não
comprime). Sem suporte, cai em `sdr` e a cena emite `presentationFallback`.
