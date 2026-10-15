[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / releasePresentationDefaults

# Function: releasePresentationDefaults()

> **releasePresentationDefaults**(`flows`): `boolean`

Defined in: [presentation/flows/defaults.ts:121](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/defaults.ts#L121)

Libera um uso dos estágios padrão da cena. O último usuário os desregistra (e descarta: GPU e inscrições).
Devolve `true` quando foi o último usuário (nenhuma aplicação usa mais a cena).

## Parameters

### flows

`FlowRegistry`

## Returns

`boolean`
