# Contrato — Tempo

## `Time` (C2, `scene/time/Time.ts`; reexportado por `presentation`)

```ts
class Time extends Entity implements Resource {
  readonly realDt: number;
  readonly dt: number;
  readonly elapsed: number;
  readonly frame: number;
  scale: number; // ≥ 0; 0 pausa tudo que depende de dt
  physicsScale: number; // ≥ 0; só a física
  fixedDt: number | undefined; // default 1/60; undefined = passo variável
  maxStepsPerFrame: number; // default 4
  maxFrameDt: number; // default 0.25 s
  readonly steps: number; // passos de física do quadro corrente
  readonly stepDt: number; // duração de cada passo
  readonly droppedTime: number;
  advance(realDt: number): void; // único ponto que move o relógio (ver data-model)
  pause(): void;
  resume(): void;
  pausePhysics(): void;
  resumePhysics(): void;
}
```

- Um `Time` por World, criado por `createScene` e inserido no World. `app.time` é esse objeto.
- Valores inválidos (`scale < 0`, `fixedDt ≤ 0`, `maxStepsPerFrame < 1`) lançam `RangeError` na atribuição.
- `timeDropped { dropped }` é emitido quando o teto de passos descarta tempo.

## Avanço do quadro

```ts
// Application (C4)
step(dt?: number, frames?: number): void; // dt default = time.fixedDt ?? 1/60; frames default 1
```

Por quadro: `time.advance(dt)` → `frameTick { dt, realDt, elapsed, frame }` (síncrono). O `GameLoop` faz exatamente o
mesmo com o `dt` medido pelo RAF. `step()` funciona com o laço parado (headless, testes, benchmark); chamar `step()`
com o laço rodando lança.

## Consumo pelos estágios de simulação

- Leem o `Time` do World (consulta por schema `Time`), nunca a `Application`.
- Executam `time.steps × substeps` iterações por quadro, cada uma com `dt = time.stepDt / substeps`.
- Parâmetros por iteração em regiões distintas do buffer de parâmetros, ligadas por offset dinâmico; escrita única por
  quadro (a escrita durante o record chega inteira antes do submit — um valor por região).
- `time.steps === 0` → o estágio não grava passes de simulação no quadro.
