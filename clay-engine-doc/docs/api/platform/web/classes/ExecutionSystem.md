[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ExecutionSystem

# Class: ExecutionSystem

Defined in: [src/scene/systems/ExecutionSystem.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ExecutionSystem.ts#L18)

ExecutionSystem grava o quadro: a cada `frameTick` emite `frameRecording` (a C2 envia os recursos sujos e
reconcilia os Flows), grava os Flows ativos por fase na ordem da regra única (fase → prioridade decrescente →
ordem de registro), faz `submit` e emite `frameComplete`.

Os Flows ativos são os anunciados por `flowReady` (com o `BoundFlow` que o `dispatch` recebe) e ainda não
suspensos (`flowSuspended`); os eventos de domínio chegam a eles pela C2 (transições), não por aqui.

Modo `captureErrors=true` envolve cada quadro em error scope GPU; erros viram `engineError` sem propagar.

## Constructors

### Constructor

> **new ExecutionSystem**(`core`, `events`, `flows`): `ExecutionSystem`

Defined in: [src/scene/systems/ExecutionSystem.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ExecutionSystem.ts#L31)

#### Parameters

##### core

[`EngineCore`](../interfaces/EngineCore.md)

##### events

[`EventBus`](../interfaces/EventBus.md)

##### flows

[`FlowRegistry`](FlowRegistry.md)

#### Returns

`ExecutionSystem`

## Properties

### captureErrors

> **captureErrors**: `boolean` = `false`

Defined in: [src/scene/systems/ExecutionSystem.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ExecutionSystem.ts#L26)

Quando true, cada frame envolve record+submit em `core.withErrorScope('validation')`
e emite `engineError` em vez de propagar exception. GameLoop continua o próximo
frame normalmente. Ativado via `Application.create({ captureErrors: true })`.

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/systems/ExecutionSystem.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ExecutionSystem.ts#L50)

Desfaz as inscrições no EventBus (descarte da cena).

#### Returns

`void`

***

### isActive()

> **isActive**(`flow`): `boolean`

Defined in: [src/scene/systems/ExecutionSystem.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ExecutionSystem.ts#L57)

O Flow está entre os ativos (anunciado por `flowReady` e não suspenso)?

#### Parameters

##### flow

[`Flow`](Flow.md)

#### Returns

`boolean`

***

### lastFrameTimestamp()

> **lastFrameTimestamp**(): `number`

Defined in: [src/scene/systems/ExecutionSystem.ts:112](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/ExecutionSystem.ts#L112)

Timestamp (ms) do último `frameComplete` emitido. Útil para sleep detection.

#### Returns

`number`
