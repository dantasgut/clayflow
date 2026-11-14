[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / releasePresentationDefaults

# Function: releasePresentationDefaults()

> **releasePresentationDefaults**(`flows`): `boolean`

Defined in: [src/presentation/flows/defaults.ts:211](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/defaults.ts#L211)

Libera um uso dos estágios padrão da cena. O último usuário os desregistra (e descarta: GPU e inscrições).
Devolve `true` quando foi o último usuário (nenhuma aplicação usa mais a cena).

## Parameters

### flows

[`FlowRegistry`](../../platform/web/classes/FlowRegistry.md)

## Returns

`boolean`
