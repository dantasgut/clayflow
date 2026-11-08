[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowTransitions

# Type Alias: FlowTransitions\<S, C\>

> **FlowTransitions**\<`S`, `C`\> = `Readonly`\<`Partial`\<`Record`\<`S` \| `"*"`, `Readonly`\<`Partial`\<`Record`\<[`FlowEventName`](FlowEventName.md), [`FlowTransition`](FlowTransition.md)\<`S`, `C`\>\>\>\>\>\>\>

Defined in: [src/scene/flows/FlowTransitions.ts:144](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowTransitions.ts#L144)

Tabela de transições de um Flow: `estado → evento → destino`. A chave `'*'` vale para qualquer estado (consultada
depois da do estado atual). Evento sem entrada é erro (`FlowTransitionError`).

## Type Parameters

### S

`S` *extends* `string`

### C

`C`
