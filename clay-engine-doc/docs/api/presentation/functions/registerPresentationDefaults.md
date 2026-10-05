[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / registerPresentationDefaults

# Function: registerPresentationDefaults()

> **registerPresentationDefaults**(`flows`, `options`): [`PresentationDefaults`](../interfaces/PresentationDefaults.md)

Defined in: [presentation/flows/defaults.ts:60](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/presentation/flows/defaults.ts#L60)

Cria e registra os 5 Flows default no FlowRegistry, com bindings adequados
(forward bind shadow, post bind forward, debug bind events).

Ordem importa: Shadow → Forward → Post → Debug → UI (priority dentro
das phases).

Chamado uma vez por `Application.create`. Apps que querem pipeline
customizado podem ignorar e construir flows manualmente.

## Parameters

### flows

`FlowRegistry`

### options

[`PresentationDefaultsOptions`](../interfaces/PresentationDefaultsOptions.md)

## Returns

[`PresentationDefaults`](../interfaces/PresentationDefaults.md)
