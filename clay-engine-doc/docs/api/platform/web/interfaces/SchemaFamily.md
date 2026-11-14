[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SchemaFamily

# Interface: SchemaFamily

Defined in: [src/scene/flows/Flow.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L25)

Família de schemas que um Flow escuta como um só: os registros tipados de todas as formas de um ponto de extensão
(spec 031, R8 — o próprio `WgslPoint`), gerados quando as funções entram na cena.

## Methods

### isRecord()

> **isRecord**(`schema`): `boolean`

Defined in: [src/scene/flows/Flow.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L27)

`schema` pertence à família?

#### Parameters

##### schema

[`Schema`](Schema.md)

#### Returns

`boolean`
