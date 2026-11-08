[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ScenePointGlobal

# Interface: ScenePointGlobal

Defined in: [src/scene/shaders/WgslPoint.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L68)

Variável global de ponto de cena: um pool e a parte dele ligada.

## Properties

### part?

> `readonly` `optional` **part?**: `"live"` \| `"records"`

Defined in: [src/scene/shaders/WgslPoint.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L72)

Registros (default) ou o bitset dos slots vivos.

***

### pool

> `readonly` **pool**: [`StructSchema`](../classes/StructSchema.md)

Defined in: [src/scene/shaders/WgslPoint.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L70)

Schema do pool.
