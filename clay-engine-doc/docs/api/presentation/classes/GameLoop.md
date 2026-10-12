[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GameLoop

# Class: GameLoop

Defined in: [presentation/app/GameLoop.ts:18](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/app/GameLoop.ts#L18)

Laço de quadros sobre `requestAnimationFrame`. Cada quadro mede o tempo real decorrido e chama `advance`, a
única definição de "avançar um quadro" — a mesma que `Application.step()` usa sem laço: `time.advance(realDt)`
e, em seguida, `frameTick { dt, realDt, elapsed, frame }`. Não há teto de `dt` aqui: o `Time` limita o quadro a
`maxFrameDt` e a física a `maxStepsPerFrame`.

Ritmo (research R18): um tick só avança quando `canAdvance()` permite (há espaço para mais um quadro na GPU);
senão espera o próximo RAF sem mover a marca de tempo — o `realDt` seguinte inclui a espera e o acumulador do
`Time` compensa até o teto.

## Constructors

### Constructor

> **new GameLoop**(`events`, `time`, `canAdvance?`): `GameLoop`

Defined in: [presentation/app/GameLoop.ts:22](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/app/GameLoop.ts#L22)

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

Defined in: [presentation/app/GameLoop.ts:29](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/app/GameLoop.ts#L29)

Avança um quadro de duração real `realDt` (s): move o relógio e emite `frameTick` (síncrono).

#### Parameters

##### realDt

`number`

#### Returns

`void`

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [presentation/app/GameLoop.ts:68](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/app/GameLoop.ts#L68)

True se o laço está ativo (RAF agendado).

#### Returns

`boolean`

***

### start()

> **start**(): `void`

Defined in: [presentation/app/GameLoop.ts:41](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/app/GameLoop.ts#L41)

Inicia o laço (RAF). No-op se já rodando.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [presentation/app/GameLoop.ts:61](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/app/GameLoop.ts#L61)

Cancela o RAF agendado. No-op se não rodando.

#### Returns

`void`
