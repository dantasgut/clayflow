[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GameLoop

# Class: GameLoop

Defined in: [presentation/app/GameLoop.ts:20](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/GameLoop.ts#L20)

Laço de quadros sobre `requestAnimationFrame`. Cada quadro mede o tempo real decorrido e chama `advance`, a
única definição de "avançar um quadro" — a mesma que `Application.step()` usa sem laço: `time.advance(realDt)`
e, em seguida, `frameTick { dt, realDt, elapsed, frame }`. Não há teto de `dt` aqui: o `Time` limita o quadro a
`maxFrameDt` e a física a `maxStepsPerFrame`.

Ritmo (research R18): um tick só avança quando `canAdvance()` permite (há espaço para mais um quadro na GPU).
Sem espaço, o laço não pede outro RAF: espera o evento `frameRetired` (um quadro terminou na GPU) e só então pede
o RAF seguinte. Um RAF que não desenha faz o navegador espaçar o próximo (sem vsync, ~1/60 s), então esperar
pelo evento é o que mantém o ritmo da GPU. A marca de tempo não se move na espera — o `realDt` seguinte a inclui
e o acumulador do `Time` compensa até o teto.

## Constructors

### Constructor

> **new GameLoop**(`events`, `time`, `canAdvance?`): `GameLoop`

Defined in: [presentation/app/GameLoop.ts:28](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/GameLoop.ts#L28)

#### Parameters

##### events

`EventBus`

##### time

[`Time`](Time.md)

##### canAdvance?

() => `boolean`

#### Returns

`GameLoop`

## Methods

### advance()

> **advance**(`realDt`): `void`

Defined in: [presentation/app/GameLoop.ts:35](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/GameLoop.ts#L35)

Avança um quadro de duração real `realDt` (s): move o relógio e emite `frameTick` (síncrono).

#### Parameters

##### realDt

`number`

#### Returns

`void`

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [presentation/app/GameLoop.ts:72](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/GameLoop.ts#L72)

True se o laço está ativo (RAF agendado ou esperando espaço na GPU).

#### Returns

`boolean`

***

### start()

> **start**(): `void`

Defined in: [presentation/app/GameLoop.ts:47](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/GameLoop.ts#L47)

Inicia o laço (RAF). No-op se já rodando.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [presentation/app/GameLoop.ts:61](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/app/GameLoop.ts#L61)

Cancela o RAF agendado e a espera pela GPU. No-op se não rodando.

#### Returns

`void`
