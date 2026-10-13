[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / releasePresentationDefaults

# Function: releasePresentationDefaults()

> **releasePresentationDefaults**(`flows`): `boolean`

Defined in: [presentation/flows/defaults.ts:88](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/defaults.ts#L88)

Libera um uso dos estágios padrão da cena. O último usuário os desregistra (e descarta: GPU e inscrições).
Devolve `true` quando foi o último usuário (nenhuma aplicação usa mais a cena).

## Parameters

### flows

`FlowRegistry`

## Returns

`boolean`
