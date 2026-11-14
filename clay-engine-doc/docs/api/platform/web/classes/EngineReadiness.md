[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EngineReadiness

# Class: EngineReadiness

Defined in: [src/scene/readiness/EngineReadiness.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/readiness/EngineReadiness.ts#L21)

Prontidão do motor (C2, spec 034): avaliada a cada quadro pela reconciliação dos Flows. `ready` quando nenhum Flow
ativo tem pipeline sem fonte, em conferência, compilando ou trocando; senão `preparing`, com a lista do que falta.
As transições saem como eventos (`enginePreparing`, `engineReady`); um binding sem fonte que persiste vira
`consumerMissing`, uma vez por Flow, pipeline e nome. A prontidão não bloqueia o quadro; o laço de quadros segura o
tempo da cena enquanto ela `holdsTime` (a simulação não anda com estágios pela metade — a colisão ainda compilando
deixaria a água atravessar as paredes); o `step()` manual não é afetado.

## Constructors

### Constructor

> **new EngineReadiness**(`events`): `EngineReadiness`

Defined in: [src/scene/readiness/EngineReadiness.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/readiness/EngineReadiness.ts#L30)

#### Parameters

##### events

[`EventBus`](../interfaces/EventBus.md)

#### Returns

`EngineReadiness`

## Accessors

### evaluations

#### Get Signature

> **get** **evaluations**(): `number`

Defined in: [src/scene/readiness/EngineReadiness.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/readiness/EngineReadiness.ts#L62)

Quantas vezes foi avaliada (um por quadro gravado).

##### Returns

`number`

***

### holdsTime

#### Get Signature

> **get** **holdsTime**(): `boolean`

Defined in: [src/scene/readiness/EngineReadiness.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/readiness/EngineReadiness.ts#L52)

O tempo da cena deve esperar: há trabalho que termina sozinho (conferência, compilação, troca, a cena assentando)
ou um binding sem fonte que ainda não foi dado como ausente (`consumerMissing`) — um consumidor sem resolvedor não
congela a cena para sempre.

##### Returns

`boolean`

***

### pending

#### Get Signature

> **get** **pending**(): readonly [`PendingWork`](../interfaces/PendingWork.md)[]

Defined in: [src/scene/readiness/EngineReadiness.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/readiness/EngineReadiness.ts#L38)

O que falta (vazio quando pronto).

##### Returns

readonly [`PendingWork`](../interfaces/PendingWork.md)[]

***

### revision

#### Get Signature

> **get** **revision**(): `number`

Defined in: [src/scene/readiness/EngineReadiness.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/readiness/EngineReadiness.ts#L43)

Sobe a cada transição.

##### Returns

`number`

***

### state

#### Get Signature

> **get** **state**(): [`ReadinessState`](../type-aliases/ReadinessState.md)

Defined in: [src/scene/readiness/EngineReadiness.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/readiness/EngineReadiness.ts#L33)

`ready` ou `preparing`.

##### Returns

[`ReadinessState`](../type-aliases/ReadinessState.md)

## Methods

### update()

> **update**(`pending`): `void`

Defined in: [src/scene/readiness/EngineReadiness.ts:67](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/readiness/EngineReadiness.ts#L67)

Avalia com o que os Flows ainda esperam neste quadro e emite as transições.

#### Parameters

##### pending

readonly [`PendingWork`](../interfaces/PendingWork.md)[]

#### Returns

`void`
