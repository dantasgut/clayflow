[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PointRecord

# Interface: PointRecord

Defined in: [src/scene/shaders/WgslPoint.ts:136](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L136)

Registro dos parâmetros de uma forma de função de ponto (spec 031, R8): o struct `<alias>_<hash>` com um campo por
parâmetro, com o tipo declarado, e a revisão do código (`revision`) — sem `bitcast` e sem teto de escalares. O nome
do schema, `<ponto>:<hash>`, é a chave do pool: as funções da mesma forma ocupam o mesmo pool, um registro cada.

## Properties

### hash

> `readonly` **hash**: `string`

Defined in: [src/scene/shaders/WgslPoint.ts:145](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L145)

Hash da forma (ponto, nomes e tipos dos parâmetros).

***

### resource

> `readonly` **resource**: [`ArenaReader`](ArenaReader.md)

Defined in: [src/scene/shaders/WgslPoint.ts:143](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L143)

O pool da forma no shader, lido pela arena de pools (T060i): `<ponto>_records_<hash>[slot]` no carregador gerado
de cada função da forma (o registro dela por slot).

***

### schema

> `readonly` **schema**: [`StructSchema`](../classes/StructSchema.md)

Defined in: [src/scene/shaders/WgslPoint.ts:138](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L138)

Schema do registro (nome `<ponto>:<hash>`, struct `<alias>_<hash>`).
