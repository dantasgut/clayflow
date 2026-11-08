[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FogVolumeValues

# Interface: FogVolumeValues

Defined in: [src/elements/media/FogVolume.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FogVolume.ts#L28)

Valores de um `FogVolume`.

## Properties

### albedo?

> `readonly` `optional` **albedo?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/elements/media/FogVolume.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FogVolume.ts#L38)

Albedo de espalhamento (rgb em [0, 1]: o resto da extinção é absorção). Padrão branco 0,9.

***

### anisotropy?

> `readonly` `optional` **anisotropy?**: `number`

Defined in: [src/elements/media/FogVolume.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FogVolume.ts#L40)

Anisotropia de Henyey-Greenstein em (−1, 1): positiva espalha para a frente (os feixes contra a luz). Padrão 0,3.

***

### center?

> `readonly` `optional` **center?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/elements/media/FogVolume.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FogVolume.ts#L32)

Centro (mundo). Padrão: a origem.

***

### density?

> `readonly` `optional` **density?**: [`FogDensity`](../type-aliases/FogDensity.md)

Defined in: [src/elements/media/FogVolume.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FogVolume.ts#L34)

Densidade (constante em 1/m, função, grafo ou grade). Padrão 0,05/m.

***

### edge?

> `readonly` `optional` **edge?**: `number`

Defined in: [src/elements/media/FogVolume.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FogVolume.ts#L44)

Largura (m) da borda suave da forma: a densidade cai a 0 até a superfície dela. Padrão 0 (borda nítida).

***

### emission?

> `readonly` `optional` **emission?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/elements/media/FogVolume.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FogVolume.ts#L42)

Emissão: a radiância (rgb) que a névoa opticamente espessa teria sozinha. Padrão nenhuma.

***

### extinction?

> `readonly` `optional` **extinction?**: `number`

Defined in: [src/elements/media/FogVolume.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FogVolume.ts#L36)

Extinção (1/m) na densidade relativa 1 — com função, grafo ou grade. Padrão 1.

***

### shape?

> `readonly` `optional` **shape?**: [`FogShape`](../type-aliases/FogShape.md)

Defined in: [src/elements/media/FogVolume.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/media/FogVolume.ts#L30)

Forma. Padrão: caixa de 10 × 10 × 10 m.
