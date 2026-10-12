# Implementation Plan: Slots de Flow

**Branch**: `feature/006-flow-slots` | **Date**: 2026-10-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-flow-slots/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md) (F1,
item 006; decisão D4) · Pendências: [`specs/PENDENCIAS.md`](../PENDENCIAS.md) · Linha de base: `bench/baselines/`

## Summary

Ligar de ponta a ponta o modelo declarativo da refundação e migrar todos os estágios para ele, sem mudar simulação nem
imagem:

1. **Flow com slots (C2)**: `Flow<TSlots, S>` declara slots (`pool`, `bodies`, `pools`, `singleton`, `entities`,
   `texture`, `target`), `pipelines` e uma tabela de transições por evento; `dispatch(frame, bound)` só grava. Os
   callbacks (`onPoolReallocated`, `onCanvasResized`, `onEntities*`, `onEvent`, `isReady`) saem.
2. **Registro e seleção (C2)**: `register(factory, { type, phase, bodyType?, priority? })`, `override`, `unregister`;
   solvers instanciados pela C2 quando o primeiro corpo do `bodyType` é alocado (`ensureFlowAllocated` → `flowReady`);
   `DEFAULT_FLOW_FACTORIES`/`autoRegisterFlows` saem.
3. **Inferência e resolução (C2)**: `LayoutInferencer.infer` sobre o WGSL montado (visibilidade por alcance de
   chamadas, tipos de binding); bindings resolvidos por nome privado ou por `consumes` (tipo do struct) via
   `ConsumerResolverRegistry` (resolvers devolvem fontes); `PoolResolver` automático por pool; layouts e bind groups
   criados pela C2, recriados com `bindGroupReplaced`. `createComputeKernel` passa a inferir o layout e aceita
   vértice/índice/indireto.
4. **Apresentação (C4)**: forward e sombra sem nada por entidade — Camera singleton, `WorldTransform` em pool,
   Material em **pool uniforme com offset dinâmico**, geometria da C2; `FrameTargets` (cor e profundidade da cena) e
   `ShadowMap` (com textura de profundidade, anexado à `DirectionalLight`, lido pelo shader) como Resources; pós, UI,
   debug no modelo.
5. **Solvers (C3)**: LCP, XPBD, FEM, MPM, SPH, PBF, Transform com slots; recursos privados recriados em transições
   (nunca no `dispatch`); `ColliderSet` como peça de slot (inclui malha); readback do LCP com mapa capturado na cópia.
6. **Fronteira (D4)**: reexports de tipos em `scene/`; regra de lint; emenda MINOR da constituição.
7. **Documento**: marcas "alvo da 006" viram estado atual; guia `flows.md`; migração; ROADMAP.

Decisões e alternativas em [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem novas dependências de runtime

**Storage**: N/A (fixtures de trajetória e imagem da 005 em `src/__smokes__/fixtures/`, reutilizadas)

**Testing**: Vitest 4 (happy-dom) com `EngineCore` de contagem para registro, transições, inferência, resolvers, pools
uniformes, bind groups substituídos, objetos e escritas por entidade; smokes de navegador (inclusive `--dist`) para
trajetórias a 30/60/144 Hz, imagem, `churn`, `limits`, `rigidContacts`; `npm run bench:check`

**Target Platform**: Chrome/Edge com WebGPU (perfil de referência `apple-metal-3-chrome154-macos-1280x720-syhprh`)

**Project Type**: biblioteca (engine)

**Performance Goals**: CPU por quadro de `instances/10k` −30% contra o baseline vigente e montagem menor; nenhuma
regressão > 10% nas demais métricas do `bench:check`

**Constraints**: sem helpers; dispatch só grava; trajetória bit a bit com as fixtures da 005 (SPH/PBF na tolerância
registrada); imagem idêntica; nenhum objeto de GPU por entidade em forward/sombra; nomes explícitos (minificação);
C1 inalterada exceto o contrato de binding de compute (vértice/índice/indireto)

**Scale/Scope**: C2 — `Flow`, `slots`, `FlowRegistry`, `ResourceSystem` (pools uniformes, `ensureFlowAllocated`,
bind groups da C2, drenagem do `flushDirty`), `ExecutionSystem`, `LayoutInferencer.infer`, `ConsumerResolver` e
estratégias, `createComputeKernel`, `TextureShape`, reexports; C3 — 6 solvers, `ColliderSet`, `PerStepUniforms`,
`NeighborSearchPipeline`, kernels genéricos, `TransformFlow`, `ShadowMap`, `DirectionalLight`, materiais; C4 —
forward, sombra, pós, UI, debug, `FrameTargets`, `defaults.ts`, `Application`; ~25 arquivos de teste novos/alterados;
smokes `trajectories` (taxas), `render`, `churn`; documento, guias, ROADMAP, constituição

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                                                                                                       | Status                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **I. Camadas e importação**     | Resolução, inferência e bind groups em C2; C3/C4 passam a importar só por `scene/` (D4) com regra no lint. O Princípio I hoje permite `core/contracts` em C3/C4 — a D4 é mais restritiva; emenda MINOR (1.1.0) proposta no PR para ratificação. | ✅ (emenda pendente de ratificação) |
| **II. Domínio na borda**        | A fachada de autoria não muda (corpos, materiais, luzes); `ShadowMap` entra como parte da `DirectionalLight` com vocabulário de domínio (tamanho, viés).                                                                                        | ✅                                  |
| **III. Resource como contrato** | Alvos de render, sombra e materiais passam a ser Resources alocados pela C2; estágios deixam de criar cópias.                                                                                                                                   | ✅                                  |
| **IV. ECS e Flows**             | Seleção por pool key/`FlowDescriptor` pela C2; ordem explícita (fase → prioridade → registro); estado por eventos.                                                                                                                              | ✅                                  |
| **V. Testes**                   | Testes CPU para registro, transições, inferência, resolvers, pools e contagens; GPU por smokes (trajetória em 3 taxas, imagem, churn), inclusive no dist.                                                                                       | ✅                                  |
| **VI. Documentação**            | Documento sem "alvo da 006"; guia `flows.md`; migração; JSDoc em todo export novo; API regenerada.                                                                                                                                              | ✅                                  |
| **Restrições técnicas**         | Sem deps novas; backend substituível preservado (a C2 só usa o contrato `EngineCore`); mudanças incompatíveis (0.x) no guia de migração.                                                                                                        | ✅                                  |
| **Quality gates**               | Ordem do CI inalterada; a fronteira entra no `lint`.                                                                                                                                                                                            | ✅                                  |

**Re-check pós-design (Fase 1)**: ✅ — os contratos ([flow-slots.md](./contracts/flow-slots.md),
[layout-inference.md](./contracts/layout-inference.md), [render-stages.md](./contracts/render-stages.md)) mantêm C1
sem conhecimento de slots, concentram resolução e bind groups na C2 e deixam aos Flows só recursos privados. Única
mudança na C1: o tipo de binding de compute aceita buffers de vértice, índice e indireto (já criados com `STORAGE`).

## Project Structure

### Documentation (this feature)

```text
specs/006-flow-slots/
├── plan.md              # Este arquivo
├── research.md          # Achados A1–A7, decisões R1–R15
├── data-model.md        # Slot, Flow, eventos, registro, fontes, pool uniforme, FrameTargets, ShadowMap
├── quickstart.md        # escrever um Flow, validar, migrar
├── contracts/
│   ├── flow-slots.md        # Flow<TSlots,S>, slot.*, FlowRegistry, ensureFlowAllocated, ExecutionSystem, erros
│   ├── layout-inference.md  # LayoutInferencer.infer, ConsumerResolver/fontes, ordem de resolução, createComputeKernel
│   └── render-stages.md     # forward, sombra, pós, UI, debug, Transform; Application
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── core/contracts/bindings/            # ComputeKernelBinding aceita vértice/índice/indireto (C1, contrato)
├── scene/                              # C2
│   ├── contracts/gpu.ts                # NOVO — reexport de tipos da C1 para C3/C4 (D4)
│   ├── flows/Flow.ts                   # Flow<TSlots,S>, lifecycle, transitions
│   ├── flows/RenderFlow.ts             # slot target
│   ├── flows/slots.ts                  # NOVO — slot.*, BoundSlot
│   ├── flows/FlowTransitions.ts        # NOVO — tabela, erro, aplicação
│   ├── flows/FlowRegistry.ts           # factory + RegisterOptions + override/unregister
│   ├── flows/createComputeKernel.ts    # bindings por nome; layout inferido
│   ├── consumers/                      # fontes; Singleton/Pool/Texture resolvers; PerEntity sai
│   ├── descriptors/TextureShape.ts     # format 'canvas'
│   ├── systems/LayoutInferencer.ts     # infer, alcance de chamadas
│   ├── systems/ResourceSystem.ts       # pool uniforme, ensureFlowAllocated, bind groups, flush drenado
│   ├── systems/flowBinding/            # NOVO — resolução de slots, preparação de pipelines, índice fonte→bind groups
│   ├── systems/ExecutionSystem.ts      # activeFlows por flowReady
│   └── SceneContext.ts                 # resolvers padrão, factories padrão dos solvers
├── elements/                           # C3
│   ├── physics/flows/*.ts              # 6 solvers em slots; defaultFlows.ts → factories registradas
│   ├── physics/colliders/ColliderSet.ts
│   ├── physics/flows/PerStepUniforms.ts
│   ├── gpu/NeighborSearchPipeline.ts, gpu/compute/*.ts   # bindings por nome
│   ├── scene/flows/TransformFlow.ts
│   ├── scene/ShadowMap.ts, scene/DirectionalLight.ts
│   └── material/*.ts                   # storage: 'pool'
├── presentation/                       # C4
│   ├── app/FrameTargets.ts             # NOVO
│   ├── app/Application.ts              # FrameTargets, factories, consumers
│   ├── flows/{Forward,Shadow,Post,UI,Debug}Flow.ts, defaults.ts
│   └── flows/shadow_depth.wgsl         # ShadowMap por slot do caster
└── __smokes__/trajectories.ts          # 30/60/144 Hz

eslint.config.js                        # fronteira C3/C4
.specify/memory/constitution.md         # emenda MINOR (D4)
clay-engine-doc/docs/guides/            # architecture_resource_loaders.md, flows.md (NOVO), migração
specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; o mecanismo inteiro na C2, consumido por contrato; C3/C4 migrados estágio a
estágio com fixtures verdes a cada passo.

## Fases de implementação (para `/speckit-tasks`)

1. **Base de verificação**: smoke `trajectories` em 30/60/144 Hz contra a fixture da 005; double de contagem do
   `EngineCore` para testes; linha de base de objetos por entidade e escritas por quadro (registrar os números de
   hoje).
2. **Fundação C2**: `LayoutInferencer.infer` (alcance de chamadas, tipos); fontes de `ConsumerResolver` e estratégias;
   pools uniformes; `slot.*`; `Flow<TSlots,S>` + transições; `FlowRegistry` por factory; `ensureFlowAllocated`,
   bind groups da C2 e `bindGroupReplaced`; `ExecutionSystem` por `flowReady`; `flushDirty` drenado;
   `createComputeKernel` por nome; reexports (D4).
3. **US3** registro/seleção: factories padrão na cena; fim do `autoRegisterFlows`.
4. **US5** solvers e Transform, um por vez com trajetórias verdes: Transform → XPBD → FEM → MPM → SPH → PBF → LCP
   (`ColliderSet`, readback); kernels genéricos e vizinhança por nome.
5. **US2** apresentação: `FrameTargets`, `ShadowMap` com textura + `DirectionalLight`; sombra → forward (pool de
   Material, geometria da C2) → pós → UI/debug; `Application`/`defaults`; imagem idêntica.
6. **US4** transições completas e erros (testes por Flow).
7. **US6** fronteira no lint, emenda da constituição, documento, `flows.md`, migração, ROADMAP, PENDENCIAS.
8. **Fechamento**: 13 smokes (inclusive `--dist`), `bench:check`, gate completo, API regenerada, status da spec.

## Complexity Tracking

| Ponto                                      | Por que é necessário                                                                                 | Alternativa mais simples rejeitada                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Emenda MINOR da constituição (Princípio I) | A D4 e o documento autoritativo restringem C3/C4 a `scene/`; a constituição permite `core/contracts` | Manter a permissão — deixaria a D4 sem regra verificável                  |
| `flushDirty` drenando a fila               | Derivações CPU que dependem de outro Resource (matriz da luz → `ShadowMap`) entram no mesmo quadro   | Gravar direto no buffer pelo estágio — volta a ser escrita por fora da C2 |
