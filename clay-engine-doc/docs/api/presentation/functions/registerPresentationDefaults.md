[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / registerPresentationDefaults

# Function: registerPresentationDefaults()

> **registerPresentationDefaults**(`flows`, `options`): [`PresentationDefaults`](../interfaces/PresentationDefaults.md)

Defined in: [presentation/flows/defaults.ts:74](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/defaults.ts#L74)

Registra por factory os estágios padrão da cena — Transform, Camera, ShadowMatrix, Shadow, Forward, Post, Debug e UI, mais os solvers
padrão — e insere os alvos do quadro (`FrameTargets`: o render principal desenha neles, o pós-processamento os lê
pelo slot). **Uma vez por cena**: chamadas seguintes com o mesmo `FlowRegistry` devolvem os mesmos estágios e
contam mais um usuário (várias aplicações na mesma cena não duplicam estágios). Cada chamada deve ser pareada com
`releasePresentationDefaults`.

A ordem no quadro vem das fases (`transform → shadow → forward → post → ui`) e da prioridade dentro delas.

Chamado por `Application.create`. Apps que querem outro pipeline podem registrar as suas factories
(`flows.register`/`flows.override`).

## Parameters

### flows

`FlowRegistry`

### options

[`PresentationDefaultsOptions`](../interfaces/PresentationDefaultsOptions.md)

## Returns

[`PresentationDefaults`](../interfaces/PresentationDefaults.md)
