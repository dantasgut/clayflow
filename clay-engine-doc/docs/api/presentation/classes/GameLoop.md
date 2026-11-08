[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / GameLoop

# Class: GameLoop

Defined in: [src/presentation/app/GameLoop.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/GameLoop.ts#L26)

Laço de quadros sobre o agendador do ambiente (`FrameScheduler`, spec 038: o `requestAnimationFrame` no navegador,
o laço do Deno). Cada quadro mede o tempo real decorrido e chama `advance`, a
única definição de "avançar um quadro" — a mesma que `Application.step()` usa sem laço: `time.advance(realDt)`
e, em seguida, `frameTick { dt, realDt, elapsed, frame }`. Não há teto de `dt` aqui: o `Time` limita o quadro a
`maxFrameDt` e a física a `maxStepsPerFrame`.

Tempo da cena (spec 034): enquanto `holdsTime()` (o motor ainda preparando estágios), o quadro avança com tempo zero —
desenha, mas a simulação e o movimento da cena não andam com estágios pela metade; a marca de tempo segue, sem
recuperar depois o tempo da espera.

Ritmo (research R18): um tick só avança quando `canAdvance()` permite (há espaço para mais um quadro na GPU).
Sem espaço, o laço não pede outro RAF: espera o evento `frameRetired` (um quadro terminou na GPU) e só então pede
o RAF seguinte. Um RAF que não desenha faz o navegador espaçar o próximo (sem vsync, ~1/60 s), então esperar
pelo evento é o que mantém o ritmo da GPU. A marca de tempo não se move na espera — o `realDt` seguinte a inclui
e o acumulador do `Time` compensa até o teto.

## Constructors

### Constructor

> **new GameLoop**(`events`, `time`, `canAdvance?`, `scheduler?`, `holdsTime?`): `GameLoop`

Defined in: [src/presentation/app/GameLoop.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/GameLoop.ts#L34)

#### Parameters

##### events

[`EventBus`](../../platform/web/interfaces/EventBus.md)

##### time

[`Time`](Time.md)

##### canAdvance?

() => `boolean`

##### scheduler?

[`FrameScheduler`](../interfaces/FrameScheduler.md)

O agendador do próximo quadro (spec 038: do ponto de entrada do ambiente).

##### holdsTime?

() => `boolean`

O tempo da cena espera (o motor preparando estágios): o quadro avança com tempo zero.

#### Returns

`GameLoop`

## Methods

### advance()

> **advance**(`realDt`): `void`

Defined in: [src/presentation/app/GameLoop.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/GameLoop.ts#L45)

Avança um quadro de duração real `realDt` (s): move o relógio e emite `frameTick` (síncrono).

#### Parameters

##### realDt

`number`

#### Returns

`void`

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [src/presentation/app/GameLoop.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/GameLoop.ts#L82)

True se o laço está ativo (RAF agendado ou esperando espaço na GPU).

#### Returns

`boolean`

***

### start()

> **start**(): `void`

Defined in: [src/presentation/app/GameLoop.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/GameLoop.ts#L57)

Inicia o laço (RAF). No-op se já rodando.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/presentation/app/GameLoop.ts:71](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/GameLoop.ts#L71)

Cancela o RAF agendado e a espera pela GPU. No-op se não rodando.

#### Returns

`void`
