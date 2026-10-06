# Implementation Plan: Endurecimento do núcleo

**Branch**: `feature/004-core-hardening` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-core-hardening/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md)
(F1, item 004) · Linha de base: `bench/baselines/` (F0)

## Summary

Cumprir, no lugar que a refundação define, os contratos do núcleo que o código ainda não cumpre:

1. **Identidade (C1)**: `specHash` memorizado por referência e composto pelas specs aninhadas; `create` congela a spec
   em profundidade; o store passa a ter posse por spec (destruir uma não derruba a outra).
2. **Dispositivo (C1)**: `DeviceOptions` (potência, features, limites), limites de escala no máximo do adaptador e
   `capabilities()`; opções de canvas preservadas em recuperação/resize.
3. **Tempo (C2)**: `Time` vira recurso da C2, um por World, com acumulador de passo fixo, teto de passos, escalas e
   pausas; `Application.step()` e `GameLoop` compartilham o mesmo avanço; os Flows de física executam `steps ×
substeps` iterações com **parâmetros por iteração em regiões de buffer com offset dinâmico** — o que também corrige
   o `dtSub` do LCP, que nunca chegou à GPU (research A1).
4. **Recursos (C2)**: a C2 aloca todos os papéis e todos os descritores (`ResourceDirectory`); transições validadas;
   `GpuManaged` pelo handler; reuso de instância proibido com mapa recurso → entidade por World; reinserção após
   remoção.
5. **Robustez**: índices `uint32` acima de 65 535 vértices; fim de `constructor.name` (o build minificado hoje **não
   desenha** — research A2), renderizáveis mantidos por eventos; vazamentos de GPU e de ouvintes corrigidos.
6. **Verificação**: benchmark com paridade de tempo simulado (1/60 s por quadro nas duas engines) e modo `--dist`;
   smokes novos de tempo, malha grande e churn.

Decisões e alternativas em [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem novas dependências de runtime (`uuid` apenas)

**Storage**: N/A

**Testing**: Vitest 4 (happy-dom) para toda lógica CPU-side; smokes de navegador (`src/__smokes__`) servidos pelo
servidor do bench, inclusive sobre o build minificado; benchmark (`npm run bench:check`) para desempenho

**Target Platform**: Chrome/Edge com WebGPU (referência: macOS/Metal, perfil `apple-metal-3-chrome154-macos-1280x720`)

**Project Type**: biblioteca (engine)

**Performance Goals**: CPU por quadro do clayflow ≥ 50% menor que o baseline da F0 em `instances/10k`,
`instances/10k-moving` e `unique-objects/1k`; nenhuma regressão > 10% (SC-001/SC-002)

**Constraints**: correções no lugar arquitetural (sem helpers); C3/C4 só por contratos; protocolo do benchmark
inalterado (paridade de tempo simulado já é o que o Rapier faz); geometria duplicada na GPU até a 006 (decisão Q1),
declarada no relatório

**Scale/Scope**: ~35 arquivos da lib (C1: `specHash`, `GpuEngineCore`, `GpuResourceStore`, `GpuContext`, contratos;
C2: `Time` novo, `ResourceSystem`, `World`, lifecycle, `ExecutionSystem`, `FlowRegistry`, `StructSchema`, eventos,
`SceneContext`; C3: 6 Flows de física + WGSL de parâmetros, geometrias, `TransformFlow`; C4: `Application`, `GameLoop`,
forward, sombra, `DebugFlow`, input), ~20 arquivos de teste, 3 smokes novos, bench (adaptador, `--dist`), guias

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                                                                                            | Status |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **I. Camadas e importação**     | Identidade, posse e dispositivo em C1 (contrato `EngineCore` + `core/gpu`); `Time` sobe para C2 justamente para que C3 o consuma sem importar C4; `ResourceDirectory` em `scene/contracts`. Nada novo importa `core/gpu` fora de C1. | ✅     |
| **II. Domínio na borda**        | API de autoria: `time.scale`, `pausePhysics()`, `fixedDt`, `app.step()`, `powerPreference`. Offsets dinâmicos, posse e layout de vértice são internos.                                                                               | ✅     |
| **III. Resource como contrato** | A C2 passa a alocar **toda** a bag declarada; `Time` continua Resource no World; estados e envio regidos pelo ciclo de vida.                                                                                                         | ✅     |
| **IV. ECS e Flows**             | Física por `Time` do World (consulta por schema), passos coerentes entre Flows por acumulador único; renderizáveis por eventos (`resourcesChanged`), não por lista fixa; reuso proibido como a refundação define.                    | ✅     |
| **V. Testes**                   | Testes CPU para cada regra nova (R15); GPU por smokes, inclusive build minificado; gate verde e benchmark sem regressão antes de concluir.                                                                                           | ✅     |
| **VI. Documentação**            | Guias (arquitetura — inclusive a mudança de camada do `Time` —, getting started, migração, benchmark), JSDoc em exports novos, notas de mudanças incompatíveis.                                                                      | ✅     |
| **Restrições técnicas**         | Backend substituível preservado (contratos C1 ampliados, implementação só em `core/gpu`); sem deps novas; mudanças incompatíveis aceitáveis em 0.x e documentadas.                                                                   | ✅     |
| **Quality gates**               | Ordem do CI inalterada.                                                                                                                                                                                                              | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — os contratos ([core-c1.md](./contracts/core-c1.md), [time.md](./contracts/time.md),
[resources-c2.md](./contracts/resources-c2.md)) mantêm C1 como única fronteira com o hardware e o `ResourceSystem` como
único dono de dado declarado; a única sobreposição com a 006 (`FlowRegistry.unregister` mínimo) é exigida pela correção
de vazamentos e será generalizada lá.

## Project Structure

### Documentation (this feature)

```text
specs/004-core-hardening/
├── plan.md              # Este arquivo
├── research.md          # Achados A1–A6, decisões R1–R15
├── data-model.md        # identidade, store, dispositivo, Time, parâmetros por passo, alocação, ciclo de vida, World
├── quickstart.md        # uso, migração, validação
├── contracts/
│   ├── core-c1.md       # create/destroy/initialize/capabilities
│   ├── time.md          # Time, step(), consumo pelos estágios
│   └── resources-c2.md  # alocação por papel, ResourceDirectory, ciclo de vida, World, descarte
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── core/                                    # C1
│   ├── contracts/EngineCore.ts              # create congela; destroy por posse; initialize(…, device); capabilities()
│   ├── contracts/DeviceOptions.ts           # NOVO — DeviceOptions, DeviceCapabilities
│   ├── gpu/specHash.ts                      # memo WeakMap, composição por spec aninhada, funções por identidade
│   ├── gpu/deepFreeze.ts                    # NOVO — congelamento profundo (para em congelados, ignora funções)
│   ├── gpu/GpuResourceStore.ts              # owners por entrada
│   ├── gpu/GpuContext.ts                    # adapter com powerPreference, features, limites; devolve capacidades
│   ├── gpu/GpuEngineCore.ts                 # create/createAsync/destroy; capabilities; opções preservadas
│   └── gpu/__tests__/                       # specHash, deepFreeze, store owners, GpuContext limites/features
├── scene/                                   # C2
│   ├── time/Time.ts                         # NOVO (movido de presentation/app) — acumulador, escalas, pausas
│   ├── events/{EventMap,FrameTickEvent,TimeDroppedEvent}.ts
│   ├── contracts/ResourceDirectory.ts       # NOVO
│   ├── descriptors/StructSchema.ts          # vertexLayout (compacto)
│   ├── lifecycle/states/DestroyedResourceStateHandler.ts # → Uninitialized
│   ├── systems/ResourceSystem.ts            # alocação por papel/descritor, transition(), handler rules, dispose()
│   ├── systems/ExecutionSystem.ts           # dispose()
│   ├── flows/FlowRegistry.ts                # unregister(flow) mínimo
│   ├── world/World.ts                       # reuso proibido; mapa por World
│   ├── SceneContext.ts                      # cria Time; dispose completo
│   └── __tests__/                           # Time, allocation, transitions, reuse, directory, dispose
├── elements/                                # C3
│   ├── physics/flows/{LCP,XPBD,FEM,MPM,SPH,PBF}Flow.ts # steps × substeps, params por região (offset dinâmico)
│   ├── physics/flows/PerStepUniforms.ts     # NOVO — uniforms por iteração (regiões + offset dinâmico), usado pelos 6
│   ├── gpu/wgsl/**                          # bind group de parâmetros com offset dinâmico (sem mudar structs)
│   ├── geometry/{Sphere,Parametric,…}Geometry.ts # uint32 acima de 65 535; indexFormat
│   ├── geometry/Geometry.ts                 # indexFormat
│   └── __tests__/                           # steps, params, índices
├── presentation/                            # C4
│   ├── app/Application.ts                   # device, capabilities, step(), Time da cena, defaults por cena, dispose
│   ├── app/GameLoop.ts                      # usa time.advance; sem teto 1/30
│   ├── flows/ForwardFlow.ts                 # renderizáveis por eventos, instanceof, formato de índice, destroy na remoção
│   ├── flows/ShadowFlow.ts                  # idem
│   ├── flows/DebugFlow.ts                   # dispose
│   ├── input/{InteractionSystem,controllers/FpsController}.ts # remoção de ouvintes
│   └── assets/GltfLoader.ts                 # UNSIGNED_BYTE → Uint16Array
└── __smokes__/{time,bigMesh,churn}.ts       # NOVOS

bench/engines/clayflow.ts                    # app.step(1/60); limitação de geometria duplicada
bench/runner/{args,cli,server}.ts, bench/vite.config.ts # --dist
clay-engine-doc/docs/guides/{architecture_resource_loaders,getting_started,migration_legacy_to_clean,benchmark}.md
README.md, specs/ROADMAP.md
```

**Structure Decision**: biblioteca única em 4 camadas; cada correção na camada dona do conceito — identidade e
dispositivo em C1, tempo e recursos em C2, consumo de tempo nos Flows de C3, apresentação em C4.

## Fases de implementação (para /speckit-tasks)

1. **Fundacional C1** — `deepFreeze`, `specHash` memorizado/composto, posse no store, contrato `create`/`destroy`;
   ajuste de chamadores se algum mutar spec (levantamento: nenhum). Bloqueia a medição.
2. **US1 (P1) — identidade barata** — testes, smoke/bench das cenas-alvo; registrar o ganho parcial.
3. **US2 (P1) — tempo** — `Time` na C2 (um por World), eventos, `advance`, `step()`/`GameLoop`; `PerStepUniforms` com
   offset dinâmico (usa `capabilities().limits.minUniformBufferOffsetAlignment` → depende do item de dispositivo
   mínimo: guardar o adapter/limites); migrar os 6 Flows; bench com `app.step(1/60)`; smoke `time.ts`.
4. **US3 (P2) — dispositivo** — `DeviceOptions`, limites, `capabilities()`, `app.capabilities`, opções preservadas.
5. **US4 (P2) — recursos** — alocação por papel e `ResourceDirectory`, `vertexLayout`, transições validadas, regras de
   handler, reuso proibido (World por instância), reinserção, `Application` em cena compartilhada, índices `uint32`;
   limitação "geometria duplicada" no adaptador do bench; smoke `bigMesh.ts`.
6. **US5 (P3) — robustez** — renderizáveis por eventos + `instanceof`; destruição na remoção; `dispose` de sistemas,
   Flows e ouvintes; `FlowRegistry.unregister`; bench `--dist`; smoke `churn.ts`; smokes sobre o dist.
7. **Polish** — guias e notas de migração, JSDoc/TypeDoc, ROADMAP (A1/A2 registrados, F5 para limites de dispatch),
   `bench:check` + leitura das cenas-alvo (SC-001/SC-002), novo baseline só se o gate passar e com justificativa, gate
   completo.

## Complexity Tracking

| Ponto                                  | Por que é necessário                                                               | Alternativa rejeitada                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Time` muda de camada (C4 → C2)        | C3 precisa consumi-lo e não pode importar C4 (Princípio I)                         | duplicar o relógio em C3, ou C3 ler por `data` sem tipo — ambos contornam o contrato |
| `FlowRegistry.unregister` antes da 006 | sem ele, Flows e ouvintes vazam ao descartar uma aplicação numa cena compartilhada | deixar o vazamento até a 006 — contraria FR-026                                      |
| Geometria duplicada na GPU até a 006   | decisão Q1: a C2 aloca a bag inteira já                                            | adiar a alocação (C2 incompleta) ou antecipar a 006                                  |
