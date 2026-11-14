[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowTransition

# Type Alias: FlowTransition\<S, C\>

> **FlowTransition**\<`S`, `C`\> = `"ignore"` \| \{ `to`: `S`; `run?`: `void`; \}

Defined in: [src/scene/flows/FlowTransitions.ts:131](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowTransitions.ts#L131)

Destino de uma transição: `'ignore'` (o evento é esperado e não muda nada) ou o próximo estado, com um passo
opcional `run` — onde o Flow recria recursos **privados** e os religa (`ctx.bind`), nunca no `dispatch`.

## Type Parameters

### S

`S` *extends* `string`

### C

`C`

## Union Members

`"ignore"`

***

### Type Literal

\{ `to`: `S`; `run?`: `void`; \}

#### to

> `readonly` **to**: `S`

Próximo estado do algoritmo.

#### run()?

> `optional` **run**(`event`, `ctx`): `void`

Passo da transição (sintaxe de método: o contexto é bivariante, como o `dispatch`).

##### Parameters

###### event

[`FlowEvent`](FlowEvent.md)

###### ctx

`C`

##### Returns

`void`
