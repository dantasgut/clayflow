# Implementation Plan: Harness de Benchmark Comparativo (clayflow vs Three.js)

**Branch**: `feature/002-benchmark-harness` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-benchmark-harness/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md) (F0)

## Summary

Criar o instrumento de medição do roadmap: um harness em `bench/` (fora da lib) que roda cenas genéricas
determinísticas — instâncias (10k/100k/1M), 1k objetos únicos, 256 luzes, 500 personagens animados, 10k corpos
rígidos — no clayflow e no Three.js `WebGPURenderer` (+ Rapier na física), em páginas isoladas conduzidas por
Playwright sobre o Chrome real, com aquecimento + janela fixa + repetições. Exporta JSON + tabela markdown,
grava baselines por perfil de máquina e reprova o gate local quando o clayflow regride > 10%.

Para medir o clayflow pela API pública (FR-016), o motor ganha uma capacidade genérica de **observabilidade de
quadro** (FR-007a): contadores de draw calls/dispatches/passes e tempo de GPU de todos os passes, desligada por
padrão, entregue no evento `frameComplete`. Detalhes e decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`), ESM; Node 22 para o runner

**Primary Dependencies**: lib — WebGPU (sem novas deps de runtime). Harness (devDependencies) — `three@0.186.1`
(`three/webgpu`), `@types/three@0.186.0`, `@dimforge/rapier3d-compat@0.21.x`, `playwright@1.63.x` (sem download de
browsers; usa `channel: 'chrome'`), `tsx` (executar o runner TS), Vite 7 (já existe)

**Storage**: arquivos — `bench/baselines/<profileId>.json` (versionado), `bench/results/*.json|md` (gitignored)

**Testing**: Vitest (happy-dom) para toda lógica CPU-side do harness (estatística, perfil, comparação, relatório,
gerador determinístico, catálogo) e da observabilidade do motor (contadores, alocador de timestamps, soma de
intervalos); smokes de navegador para a medição real (gate local, Princípio V)

**Target Platform**: Chrome/Edge desktop com WebGPU (referência: Chrome estável no macOS/Metal); runner em Node 22

**Project Type**: biblioteca (engine) + ferramenta de desenvolvimento (harness local)

**Performance Goals**: modo padrão ≤ 15 min, `--quick` ≤ 3 min (SC-007); ruído entre execuções ≤ 5% (SC-002);
overhead da observabilidade desligada ≈ 0 e ligada ≤ 2% de CPU/quadro (SC-005)

**Constraints**: harness só via API pública (FR-016); nada de `bench/` no pacote publicado, `dependencies` só `uuid`
(FR-017/018); CI sem GPU — benchmark é gate local (FR-014); sem binários/assets de terceiros commitados (R9)

**Scale/Scope**: 5 cenas / 7 variantes × 2 engines; ~25 arquivos novos em `bench/`, ~8 arquivos tocados na lib
(C1 passes/frame/profiler, C2 evento, C4 opção + DebugFlow), 1 guia de docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                                                                                                                                                                                                                         | Status |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Contadores e alocador de timestamps vivem em C1 (`core/gpu`); o tipo `FrameStats` é contrato de domínio em `core/contracts` (sem tipos WebGPU); C2 (`ExecutionSystem`) só propaga no `frameComplete`; C4 (`Application`) só expõe a opção `profiling`. O harness está fora das camadas e importa só o barrel público (regra ESLint). `madge` continua sem ciclos. | ✅     |
| **II. Domínio na borda**        | API nova em vocabulário de domínio: `profiling: true`, `stats.drawCalls`, `stats.gpuTimeMs`. Nada de QuerySet/índices na superfície.                                                                                                                                                                                                                              | ✅     |
| **III. Resource como contrato** | A observabilidade não é dado de cena enviado à GPU por elementos — é instrumentação interna do C1 (QuerySet já gerenciado pelo `GpuProfilerSystem`). Nenhum elemento C3/C4 acessa C1.                                                                                                                                                                             | ✅     |
| **IV. ECS e Flows**             | Nenhum Flow novo; ordenação de passes inalterada. Timestamps automáticos não alteram dependências.                                                                                                                                                                                                                                                                | ✅     |
| **V. Testes**                   | Lógica determinística nova (alocador de pares, soma de intervalos, contadores, estatística, comparação de baseline, perfil, relatório) com testes Vitest; medição real validada por smoke de navegador + o próprio `npm run bench`. Gate completo verde antes de concluir.                                                                                        | ✅     |
| **VI. Documentação**            | Guia `clay-engine-doc/docs/guides/benchmark.md` + seção de profiling no guia de debug; JSDoc em todo export novo (`doc:coverage`); TypeDoc regenerado.                                                                                                                                                                                                            | ✅     |
| **Restrições técnicas**         | Sem nova dep de runtime; backend substituível preservado (contrato `FrameStats` é implementável por um backend mock).                                                                                                                                                                                                                                             | ✅     |
| **Quality gates**               | CI inalterado na ordem; `lint`/`format` passam a cobrir `bench/`; benchmark e `typecheck:bench` documentados como gate local.                                                                                                                                                                                                                                     | ✅     |

**Re-check pós-design (Fase 1)**: ✅ sem violações — o contrato [frame-stats-api.md](./contracts/frame-stats-api.md)
mantém C1 como única fronteira com o hardware e a superfície pública em vocabulário de domínio.

## Project Structure

### Documentation (this feature)

```text
specs/002-benchmark-harness/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões R1–R12
├── data-model.md        # Fase 1 — entidades do harness e da observabilidade
├── quickstart.md        # Fase 1 — rodar, verificar, gravar baseline, adicionar cena
├── contracts/
│   ├── frame-stats-api.md   # API pública nova do motor (FR-007a)
│   ├── scene-api.md         # Contrato de cena + adaptador de engine (FR-015)
│   ├── cli.md               # Comandos npm e flags
│   └── results-schema.md    # Formato de resultados e baseline
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks — não criado aqui)
```

### Source Code (repository root)

```text
src/                                   # LIB — mudanças mínimas (FR-007a)
├── core/contracts/
│   ├── FrameStats.ts                  # NOVO — tipo de domínio { drawCalls, dispatches, passes, gpuTimeMs? }
│   └── EngineCore.ts                  # + setFrameProfiling(enabled), lastFrameStats()
├── core/gpu/
│   ├── GpuContext.ts                  # requiredFeatures inclui 'timestamp-query' quando o adaptador oferece
│   ├── GpuFrame.ts                    # contadores por quadro; injeta timestampWrites automáticos nos passes
│   ├── passes/GpuRenderPass.ts        # draw/drawIndexed/indirect/executeBundles → contador
│   ├── passes/GpuBundleRenderPass.ts  # conta draws gravados no bundle
│   ├── passes/GpuComputePass.ts       # dispatch/dispatchIndirect → contador
│   ├── profiler/GpuProfilerSystem.ts  # alocador de pares por quadro, capacidade configurável, soma de intervalos
│   ├── profiler/FrameTimestampAllocator.ts  # NOVO — lógica pura (testável) de pares + soma
│   └── GpuEngineCore.ts               # liga tudo; expõe lastFrameStats()
├── scene/events/EventMap.ts           # FrameCompleteEvent + stats: FrameStats
├── scene/systems/ExecutionSystem.ts   # anexa stats ao frameComplete
├── presentation/app/Application.ts    # ApplicationOptions.profiling
└── presentation/flows/DebugFlow.ts    # preenche stagesNs (hoje sempre vazio)

bench/                                 # HARNESS — fora da lib (FR-018)
├── index.html                         # página única; ?scene=&variant=&engine=&seed=…
├── vite.config.ts                     # root bench/, alias clayflow → ../src/index.ts
├── tsconfig.json                      # tipos three + node; checado por typecheck:bench
├── runner/
│   ├── cli.ts                         # npm run bench | bench:check | bench:baseline
│   ├── browser.ts                     # Playwright + Chrome (flags WebGPU, sem vsync)
│   ├── server.ts                      # Vite programático
│   └── orchestrate.ts                 # loop cena×variante×engine×repetição, timeout, isolamento
├── core/                              # lógica pura, testada em Vitest
│   ├── types.ts                       # contratos (scene-api.md, results-schema.md)
│   ├── catalog.ts                     # registro de cenas
│   ├── rng.ts                         # mulberry32 + geradores de layout compartilhados
│   ├── stats.ts                       # mediana, p95, p99, CV, agregação de repetições
│   ├── profile.ts                     # EnvironmentProfile + profileId
│   ├── compare.ts                     # baseline × atual → RegressionReport
│   ├── report.ts                      # JSON + tabela markdown
│   └── __tests__/*.test.ts
├── page/
│   ├── main.ts                        # lê query, monta adaptador, mede, publica window.__benchResult
│   └── sampler.ts                     # amostragem de intervalos de quadro, aquecimento/janela
├── engines/
│   ├── clayflow.ts                    # EngineAdapter clayflow (só barrel público)
│   └── three.ts                       # EngineAdapter Three.js WebGPURenderer
├── scenes/
│   ├── instances/{scene.ts,clayflow.ts,three.ts}
│   ├── unique-objects/{scene.ts,clayflow.ts,three.ts}
│   ├── point-lights/{scene.ts,clayflow.ts,three.ts}       # clayflow: unsupported até F3
│   ├── skinned-characters/{scene.ts,three.ts,character.ts} # clayflow: unsupported até F4
│   └── rigid-bodies/{scene.ts,clayflow.ts,three.ts}       # three: + Rapier
├── baselines/                         # <profileId>.json — versionado
└── results/                           # gitignored (latest.json, latest.md, histórico)

clay-engine-doc/docs/guides/benchmark.md   # guia (FR-019)
```

**Structure Decision**: biblioteca única existente (`src/` em 4 camadas) + diretório de ferramenta `bench/` na raiz,
fora do `include` do build da lib e do `tsconfig.json` raiz (tem o próprio). Separação `core/` (puro, testável) ×
`page/`+`engines/`+`scenes/` (navegador) × `runner/` (Node) mantém a lógica de decisão testável em CI e a medição
real no gate local.

## Mudanças de tooling (sem alterar a ordem do CI)

| Item                   | Mudança                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` scripts | `bench`, `bench:check`, `bench:baseline`, `typecheck:bench`; `lint` → `eslint src bench`; `format`/`format:check` incluem `bench/**/*.{ts,json,md}` |
| `vitest.config.ts`     | `include` + `bench/**/__tests__/**/*.test.ts`                                                                                                       |
| `eslint.config.js`     | bloco `bench/**/*.ts` com `no-restricted-imports` proibindo `**/src/**` exceto o alias `clayflow`                                                   |
| `knip.json`            | entries `bench/runner/cli.ts`, `bench/page/main.ts`, `bench/vite.config.ts`; project `bench/**/*.ts`                                                |
| `.gitignore`           | `bench/results/**`                                                                                                                                  |
| devDependencies        | `three`, `@types/three`, `@dimforge/rapier3d-compat`, `playwright`, `tsx`                                                                           |

## Fases de implementação (para /speckit-tasks)

1. **Setup** — devDeps, scripts, configs (vite/tsconfig/eslint/knip/vitest/gitignore) e esqueleto de `bench/`.
2. **Fundacional (bloqueia US1)** — observabilidade do motor (FR-007a) com testes; tipos/contratos do harness;
   `rng`, `stats`, `profile` com testes.
3. **US1 (P1)** — página, sampler, adaptadores, as 5 cenas nas duas engines, runner Playwright, relatório
   JSON/markdown, filtros e `--quick`; smoke: `npm run bench --quick` completo.
4. **US2 (P2)** — baseline por perfil, `compare` + gate, `bench:baseline`/`bench:check`; testes incluindo a
   degradação sintética de 15% (SC-003).
5. **US3 (P3)** — catálogo declarativo + suporte a "não suportado"; cena-exemplo de teste que prova SC-004.
6. **Polish** — guia de docs, JSDoc/TypeDoc, verificação SC-005 (`npm pack --dry-run`, overhead ≤ 2%), primeiro
   relatório + baseline da máquina de referência commitados (SC-006), gate completo verde.

## Complexity Tracking

Sem violações constitucionais. Única mudança na lib (FR-007a) justificada em research R7: sem ela, o benchmark do
clayflow não teria draw calls nem GPU via API pública, e as fases F1+ não conseguiriam provar "CPU constante".
