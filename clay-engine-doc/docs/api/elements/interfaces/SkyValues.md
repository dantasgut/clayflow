[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SkyValues

# Interface: SkyValues

Defined in: [src/elements/scene/sky/Sky.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/sky/Sky.ts#L21)

Valores de um `Sky`.

## Properties

### altitude?

> `readonly` `optional` **altitude?**: `number`

Defined in: [src/elements/scene/sky/Sky.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/sky/Sky.ts#L27)

Altitude do observador acima do chão (km). Default 0,2.

***

### groundAlbedo?

> `readonly` `optional` **groundAlbedo?**: readonly `number`[]

Defined in: [src/elements/scene/sky/Sky.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/sky/Sky.ts#L29)

Albedo do chão do planeta (para o múltiplo espalhamento). Default 0,3.

***

### night?

> `readonly` `optional` **night?**: readonly `number`[]

Defined in: [src/elements/scene/sky/Sky.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/sky/Sky.ts#L31)

Piso de radiância noturna (nits, RGB) — o céu nunca fica abaixo dele. Default `[0.0005, 0.0008, 0.0015]`.

***

### sun

> `readonly` **sun**: [`DirectionalLight`](../classes/DirectionalLight.md)

Defined in: [src/elements/scene/sky/Sky.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/sky/Sky.ts#L23)

A luz direcional que faz o papel de sol: a direção e a iluminância (lux, fora da atmosfera) vêm dela.

***

### sunDisk?

> `readonly` `optional` **sunDisk?**: `boolean`

Defined in: [src/elements/scene/sky/Sky.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/sky/Sky.ts#L33)

Desenha o disco do sol no fundo. Default `true`.

***

### turbidity?

> `readonly` `optional` **turbidity?**: `number`

Defined in: [src/elements/scene/sky/Sky.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/sky/Sky.ts#L25)

Turbidez: multiplica os aerossóis (Mie). 1 = céu limpo. Default 1.
