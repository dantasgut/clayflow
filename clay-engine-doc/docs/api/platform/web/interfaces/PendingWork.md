[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PendingWork

# Interface: PendingWork

Defined in: [src/scene/events/EventMap.ts:184](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L184)

Um trabalho que impede o quadro de sair completo (spec 034, prontidão do motor).

## Properties

### flow

> `readonly` **flow**: `string`

Defined in: [src/scene/events/EventMap.ts:186](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L186)

Tipo do Flow.

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [src/scene/events/EventMap.ts:197](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L197)

Binding sem fonte (`waiting`).

***

### pipeline

> `readonly` **pipeline**: `string`

Defined in: [src/scene/events/EventMap.ts:188](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L188)

Pipeline do Flow.

***

### reason

> `readonly` **reason**: `"waiting"` \| `"verifying"` \| `"compiling"` \| `"swapping"` \| `"settling"`

Defined in: [src/scene/events/EventMap.ts:195](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L195)

`waiting`: um binding sem fonte na cena; `verifying`: conferência do compilador em voo; `compiling`: compilação
em voo; `swapping`: o pipeline refeito com a composição nova da cena ainda não entrou no lugar do atual;
`settling`: entidades entraram ou saíram da cena e as reações delas (envio, Flows novos, composição) ainda não
apareceram — vale nos dois quadros seguintes à mudança (`flow` = `World`).
