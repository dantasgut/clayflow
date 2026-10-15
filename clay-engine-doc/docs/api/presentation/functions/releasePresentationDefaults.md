[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / releasePresentationDefaults

# Function: releasePresentationDefaults()

> **releasePresentationDefaults**(`flows`): `boolean`

Defined in: [presentation/flows/defaults.ts:120](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/defaults.ts#L120)

Libera um uso dos estágios padrão da cena. O último usuário os desregistra (e descarta: GPU e inscrições).
Devolve `true` quando foi o último usuário (nenhuma aplicação usa mais a cena).

## Parameters

### flows

`FlowRegistry`

## Returns

`boolean`
