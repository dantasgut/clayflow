[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / releasePresentationDefaults

# Function: releasePresentationDefaults()

> **releasePresentationDefaults**(`flows`): `boolean`

Defined in: [presentation/flows/defaults.ts:94](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/flows/defaults.ts#L94)

Libera um uso dos estágios padrão da cena. O último usuário os desregistra (e descarta: GPU e inscrições).
Devolve `true` quando foi o último usuário (nenhuma aplicação usa mais a cena).

## Parameters

### flows

`FlowRegistry`

## Returns

`boolean`
