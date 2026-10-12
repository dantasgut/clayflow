[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / registerPresentationDefaults

# Function: registerPresentationDefaults()

> **registerPresentationDefaults**(`flows`, `options`): [`PresentationDefaults`](../interfaces/PresentationDefaults.md)

Defined in: [presentation/flows/defaults.ts:71](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/flows/defaults.ts#L71)

Registra os Flows default da cena — Transform, Shadow, Forward, Post, Debug e UI — com bindings adequados
(forward bind shadow, post bind forward, debug bind events). **Uma vez por cena**: chamadas seguintes com o
mesmo `FlowRegistry` devolvem os mesmos estágios e contam mais um usuário (várias aplicações na mesma cena não
duplicam estágios). Cada chamada deve ser pareada com `releasePresentationDefaults`.

Ordem importa: Shadow → Forward → Post → Debug → UI (priority dentro
das phases).

Chamado por `Application.create`. Apps que querem pipeline customizado podem ignorar e construir flows
manualmente.

## Parameters

### flows

`FlowRegistry`

### options

[`PresentationDefaultsOptions`](../interfaces/PresentationDefaultsOptions.md)

## Returns

[`PresentationDefaults`](../interfaces/PresentationDefaults.md)
