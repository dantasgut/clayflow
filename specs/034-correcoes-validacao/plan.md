# Implementation Plan: Correções da validação na RTX 4090

**Branch**: `fix/034-correcoes-validacao` | **Date**: 2026-10-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/034-correcoes-validacao/spec.md` e [analise.md](./analise.md)

## Summary

Corrigir o que a validação na RTX 4090 e as auditorias acharam, sem refazer o modelo de luz da 033 (a radiometria
está correta). São quatro frentes:

1. **Luz**: o gather de tela passa a cobrir só o campo próximo e a pegar o campo distante das sondas do mundo, com
   histerese própria, contenção de firefly e filtro à-trous (R1–R5). As cáusticas por fótons passam a conservar o
   fluxo (R6). Também entram a corrida das sondas (R7) e a sombra, a névoa e os rebatimentos (L6–L9).
2. **Desperdício**: fótons sem alvo, GI que não desfaz o que ligou, passes que rodam sem nada mudar (R9),
   transforms, física fragmentada, pós, CPU por quadro e memória.
3. **Smokes**: as seis checagens antigas corrigidas no motor, critério intocado (R10); a prontidão do motor faz a física esperar o colisor
   (R8); o profiler ganha um anel de leituras (R11); `field.test` com culling.
4. **Modularidade e medida**: módulos WGSL únicos (R13), divisão dos objetos-deus (R14), fronteira de `scene/graph`,
   e o bench sem teto de 60 FPS com baseline `nvidia-lovelace` (R12).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem dependências novas

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`; baseline em `bench/baselines/`)

**Testing**:

- **Vitest** (`countingCore`) para:
  - a regra de histerese do gather (R2);
  - a normalização das cáusticas na CPU (R6, fluxo integrado em planos);
  - a prontidão (R8);
  - as revisões de "nada mudou" (R9);
  - a referência de CPU da apresentação (AgX, sRGB, exposição) (R10);
  - o traçado de caminhos com dielétrico rugoso, dispersão e água (R15, R16);
  - o erro do campo de distância depois do redistanciamento (R16);
  - o anel do profiler (R11);
  - as duplicatas de WGSL (R13);
  - `densityAt` com culling.
- **Smokes de navegador**, fonte e `--dist`, **com janela** (sem `--headless`: a 4090/Vulkan perde o device em
  headless, e o usuário acompanha):
  - novos: `giNoise` (cena com janela: manchas, ruído temporal, viés) e `causticFlux` (conservação);
  - todos os existentes.
- `bench:check`, `npm run ci` e os vídeos `npm run video`.

**Target Platform**: Chrome com WebGPU. Perfil de medida: `nvidia-lovelace` (Linux, Vulkan, X11). O Mac
(`apple-metal-3`) valida no fechamento.

**Project Type**: biblioteca (engine)

**Performance Goals**:

- GI ≤ 2,19 ms a 1280×720 na 4090, sem regressão com o gather corrigido.
- Cena sem alvo de cáustica: 0 dispatch de fótons.
- GI desligada: GPU a ±3 % da cena sem GI.
- Cena parada: 0 refit/rebuild, 0 campo refeito, 0 sombra redesenhada.
- LCP: passes por passo ≤ 1/4 do atual; CPU de `rigid-bodies/10k` −0,5 ms.

**Constraints**:

- Resource + evento + Flow, sem helpers.
- O dispatch só grava; nenhuma leitura de volta por quadro.
- Trajetórias bit a bit, exceto onde a física passa a esperar o colisor (S2): as trajetórias com colisor são
  regravadas uma vez, com justificativa.
- Um símbolo WGSL por definição, e só `shaders.ts` importa `.wgsl`.
- C3/C4 importam só a C2; sem ciclos.

**Scale/Scope**:

- **C2**: prontidão, revisões, fronteira de `scene/graph`, divisão do `ResourceSystem`.
- **C1**: compilações em voo, `specHash`, profiler.
- **C3**: gather de tela, sondas, fótons, estrutura de raios, campo de fluido, física, `TransformFlow`, módulos WGSL.
- **C4**: GI ligar/desligar, sombra, pós, UI, `ForwardFlow`.
- Também: smokes, bench, docs e PENDENCIAS.

## Constitution Check

| Princípio                       | Avaliação                                                                                                                                   | Status |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Prontidão e revisões na C2; luz, física e profiler na C3; GI/pós na C4. A importação de `scene/graph` entra no lint ou no contrato (FR-023) | ✅     |
| **II. Domínio na borda**        | Novos parâmetros de autoria só onde há sentido de domínio (`screenReach`, `screenHistory` com default pela qualidade); o resto é interno    | ✅     |
| **III. Resource como contrato** | Estados novos (resposta da sonda de tela, revisões) em recursos declarados; `RayScene` com dono registrado                                  | ✅     |
| **IV. ECS e Flows**             | Pular o dispatch é decisão do Flow pelas revisões; a física espera a prontidão do estágio; o dispatch só grava                              | ✅     |
| **V. Testes**                   | CPU para regras, normalizações e revisões; GPU por smokes com medidas (fonte e `--dist`); duplicatas de WGSL no CI                          | ✅     |
| **VI. Documentação**            | Guia da GI (campo próximo/distante, histerese), arquitetura (prontidão, revisões), PENDENCIAS (H1, H4, H5, G3, H3)                          | ✅     |
| **Restrições técnicas**         | Sem deps; API por acréscimo (`app.ready()`, evento `ready`); cenas antigas sem mudança de autoria                                           | ✅     |
| **Quality gates**               | `npm run ci` + smokes (fonte e `--dist`, 3 rodadas) + `bench:check` com o baseline novo                                                     | ✅     |

## Project Structure

### Documentation (this feature)

```text
specs/034-correcoes-validacao/
├── analise.md       # Levantamento: achados L/D/M/S/V com evidência
├── spec.md          # Histórias US1–US6, FR-001–FR-030, SC-001–SC-011
├── plan.md          # Este arquivo
├── research.md      # Decisões R1–R14
└── tasks.md         # Tarefas por história
```

### Source Code (repository root)

```text
src/
├── scene/
│   ├── systems/ResourceSystem.ts            # R14: fachada sobre PoolStore, OwnAllocator, UploadQueue, ReadbackService…
│   ├── systems/resources/                   # R14: partes novas
│   ├── systems/flowBinding/PipelineState.ts # R8: catch da compilação depois do dispose
│   └── flows/FlowRegistry.ts                # D8: ordem por fase em cache; R8: prontidão
├── core/gpu/
│   ├── GpuEngineCore.ts                     # R8: compilações em voo
│   ├── specHash.ts                          # D8: sem WeakSet por chamada
│   └── profiler/GpuProfilerSystem.ts        # R11: anel de stagings
├── elements/
│   ├── lighting/                            # GlobalIllumination (screenReach, screenHistory), ProbeFlow (R2, R7), points
│   ├── gpu/wgsl/gi/                         # gi_screen_* (R1–R5), gi_probe_blend + gi_probe_response (R7), gi_photon_* (R6, D1), gi_generation/gi_weights (L8, L9)
│   ├── gpu/wgsl/forward_transmission.wgsl   # R15: refração traçada
│   ├── gpu/wgsl/math/                       # R13: hash, half, basis, fullscreen
│   ├── gpu/wgsl/media/                      # L7: jitter e reprojeção dos froxels
│   ├── raytrace/RaySceneFlow.ts             # D3, R9
│   ├── fields/FluidFieldFlow.ts             # D4, R9; R16: redistanciamento
│   ├── fields/reference/field.ts            # S4: culling no densityAt
│   ├── physics/flows/                       # D5: passes compartilhados, indireto; R8: espera do colisor
│   └── scene/flows/TransformFlow.ts         # D6
├── presentation/
│   ├── reference/                           # R10: AgX/sRGB de referência
│   ├── flows/defaults.ts                    # D2: desfazer a GI
│   ├── flows/ShadowFlow.ts, ForwardFlow.ts  # D7, D8, R14 (GroupRecorder compartilhado)
│   ├── flows/UIFlow.ts                      # D8
│   ├── flows/effects/effects.wgsl           # D7, M4: fusão, mips do bloom, blur separável, FXAA após o tone map
│   └── resources/PostProcessEffect.ts       # D7: força nula sem passe
└── __smokes__/
    ├── giNoise.ts, causticFlux.ts           # novos (FR-029)
    ├── refraction.ts                        # US7: seis cenários contra o traçado de caminhos
    └── extensionPoints.ts, nodeGraphs.ts, softSurface.ts, fluidSurface.ts, parametricSurfaces.ts  # S1–S3
bench/runner/orchestrate.ts, browser.ts      # R12
```

**Structure Decision**: biblioteca única; os caminhos acima são os existentes. Os únicos arquivos novos são os
módulos WGSL de `math/`, as partes do `ResourceSystem`/`ForwardFlow`, `gi_probe_response` e os dois smokes. O
profiler e o `specHash` ficam na C1 (`core/gpu`), mexidos só pela C1.

## Ordem de execução

1. Setup e base: estado de partida e os dois smokes novos **antes** de mexer, para medir o antes.
2. **US4 em parte primeiro**: prontidão (R8) e a referência da apresentação (R10). Sem isso os smokes não servem de régua
   para o resto.
3. US1 (luz) e US2 (cáusticas), P1.
4. US3 (desperdício), US6 (bench). US6 vem cedo dentro da P2/P3 porque dá a régua de desempenho da US3.
5. US5 (modularidade): refatoração por último, quando os smokes estiverem verdes e servirem de rede.
6. Fechamento: 3 rodadas de smokes, `ci`, vídeos, docs, PENDENCIAS, validação no Mac.

## Complexity Tracking

| Violação                                                           | Por que é necessária                                             | Alternativa mais simples descartada porque                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Trajetórias com colisor regravadas (a física espera o colisor, R8) | Hoje os primeiros passos rodam sem colisor e dependem do relógio | Manter bit a bit preservaria um resultado errado que varia por máquina |
