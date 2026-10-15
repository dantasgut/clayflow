# Implementation Plan: Superfícies paramétricas completas

**Branch**: `feature/010-parametric-surfaces` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-parametric-surfaces/spec.md` · Roadmap:
[`specs/ROADMAP.md`](../ROADMAP.md) (F3) · Baseline: o regravado na 009

## Summary

Fecha a F3 sobre a superfície avaliada na GPU da 009:

1. **Colisor derivado da superfície (C3)**: `SurfaceCollider` (Resource com registro e campo em pool, R1) construído
   na GPU pelo `SurfaceColliderFlow` na fase de física, **uma cópia por passo** quando a superfície anima (R2); novo
   tipo `surface` na fronteira `ColliderHit` lido por SPH/PBF/MPM por um cursor de passo (R3), narrowphase próprio no
   LCP (R4), e colisão pela primeira vez em XPBD, FEM e emissor (R5).
2. **Geometria diferencial (C3)**: módulo `surface_sample` único (uniforme, adaptativa, colisor); métrica, segunda
   forma, curvaturas e direção principal num pool à parte (o vértice de 32 B não muda); `SurfaceSample` com os campos
   novos pela variante `forward_diff` (R6, R7).
3. **Malha adaptativa (C3 + C4)**: níveis por retalho (curvatura e câmera), orçamento na GPU, arestas por colapso
   sobre o vizinho (sem frestas por construção), desenho `indexedIndirect` no forward e na sombra (R8).
4. **Geometria de CPU**: normais por diferenças (R9).
5. **Verificação**: smoke `parametricSurfaces` com medidas e imagens, a água formando lago no terreno (R10), fixtures
   existentes intactas, variantes de bench, vídeos (R11).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU (feature opcional `indirect-first-instance`); sem dependências novas

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (`countingCore`): descritores e realocação do `SurfaceCollider`, fontes do `ColliderSet`,
despachos do `SurfaceColliderFlow` (cópias por passo, só ao mudar), cursor de passo, narrowphase de superfície só com
contagem > 0, faixa `pool_base` no fim, XPBD/FEM/emissor sem colliders sem passe novo, pool diferencial, variante
`forward_diff`, ramo indireto do forward/sombra, gatilhos de refazer a adaptativa, normais da `ParametricGeometry`,
referência de CPU das curvaturas; smokes de navegador (inclusive `--dist`): `parametricSurfaces` (novo) e todos os
existentes sem regravar; `bench:check`; `npm run ci`

**Target Platform**: Chrome/Edge com WebGPU (perfil de referência Apple Metal 3)

**Project Type**: biblioteca (engine)

**Performance Goals**: `bench:check` sem regressão; colisor 64³ por distância reconstruído a cada passo ≤ 2 ms de GPU;
terreno 128² ≤ 0,3 ms; adaptativa refeita ≤ 1 ms

**Constraints**: sem helpers (Resource + evento + Flow); dispatch só grava; nenhuma leitura de volta; fixtures bit a
bit sem superfícies colidíveis; um símbolo WGSL por pipeline; C3/C4 importam só a C2; sem ciclos; resultados
independentes da ordem das threads (atômicos de ordem total)

**Scale/Scope**: C3 (colisor, Flow, `collider_set.wgsl`, narrowphase, XPBD/FEM/emissor, `surface_sample`, diferencial,
adaptativa, prontas analíticas, `ParametricGeometry`); C4 (`ForwardFlow`, `ShadowFlow`, feature do device); smoke;
bench; docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                       | Status |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Tudo na C3/C4 sobre a C2 (pools com `count > 1`, `indirect`, `indexedIndirect` reexportado); C1 intocada (a feature já é opção do device)       | ✅     |
| **II. Domínio na borda**        | Autoria por modo, resolução, folga, orçamento e tolerância; layouts gerados dos schemas                                                         | ✅     |
| **III. Resource como contrato** | Colisor, campo, dado diferencial e buffers da adaptativa são descritos pelos Resources (`SurfaceCollider`, `ParametricSurface`)                 | ✅     |
| **IV. ECS e Flows**             | Construção e refação por transições (`framePrepare`, `resourceReady`, `poolWritten`); `dispatch` só grava; passos no laço de cada Flow          | ✅     |
| **V. Testes**                   | CPU para descritores, despachos, gatilhos e referências; GPU por smoke com medidas e fixtures (fonte e dist); fixtures existentes intactas      | ✅     |
| **VI. Documentação**            | Arquitetura (colisor por passo, tipo novo na fronteira), guias de física e de superfícies, ROADMAP (F3 fechada), PENDENCIAS (P2 parcial), JSDoc | ✅     |
| **Restrições técnicas**         | Sem deps; API só com acréscimos; caminho sem superfícies é o atual                                                                              | ✅     |
| **Quality gates**               | `npm run ci` (ordem do workflow) + smokes + `bench:check`                                                                                       | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/surfaces.md) fixa a consulta e as garantias; o campo é
dado de Resource em pool (nenhum buffer privado consumido por outro Flow); o único acréscimo de device é uma feature
opcional pedida pela C4 por `DeviceOptions`.

## Project Structure

### Documentation (this feature)

```text
specs/010-parametric-surfaces/
├── plan.md
├── research.md          # Achados A1–A14, decisões R1–R11
├── data-model.md
├── quickstart.md
├── contracts/surfaces.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/elements/
├── physics/colliders/SurfaceCollider.ts (NOVO), ColliderSet.ts      # tipo surface, campo, cursor de passo
├── physics/flows/SurfaceColliderFlow.ts (NOVO)                      # construção por passo
├── physics/flows/{LCP,SPH,PBF,MPM,XPBD,FEM}Flow.ts                  # cursor; narrowphase surface; colisão XPBD/FEM
├── particles/EmitterFlow.ts                                         # variante com colliders
├── gpu/wgsl/math/collider_set.wgsl, math/surface_collider_hit.wgsl (NOVO)
├── gpu/wgsl/kernels/surface_collider_{eval,height,seed,jfa,finish}.wgsl (NOVOS), collider_step.wgsl (NOVO)
├── gpu/wgsl/kernels/rb_narrowphase.wgsl, xpbd_collide.wgsl (NOVO), fem_collide.wgsl (NOVO), emit_update.wgsl
├── geometry/ParametricSurface.ts, SurfaceFlow.ts, SurfaceSchemas.ts, shaders.ts, ParametricGeometry.ts
├── gpu/wgsl/kernels/surface_sample.wgsl (NOVO), surface_eval.wgsl, surface_adapt_{level,budget,scan,emit}.wgsl (NOVOS)
├── gpu/wgsl/kernels/surface_fn_ready.wgsl                           # derivadas analíticas das prontas
├── extension/SurfaceFunction.ts                                     # surface_duu/duv/dvv
├── material/point/shaders.ts, gpu/wgsl/material_point_types.wgsl, material_check.wgsl
├── scene/Renderable.ts                                              # diff_first
src/presentation/flows/ForwardFlow.ts, ShadowFlow.ts, forward.wgsl, indirect_args.wgsl (NOVO), defaults.ts
src/presentation/app/                                                # indirect-first-instance quando houver
src/__smokes__/parametricSurfaces.ts (NOVO) + support/surfaceScenes.ts (NOVO); bigMesh.ts (luz)
bench/scenes/particles (64k-terrain), bench/scenes/instances (surface-adaptive)
clay-engine-doc/docs/guides/ (arquitetura, física, superfícies), specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; colisão no domínio da física (C3), geometria diferencial e adaptativa no
domínio da geometria (C3), desenho indireto nos passes (C4). Nenhuma mudança na C1/C2.

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: números de partida do bench (máquina livre); smoke `parametricSurfaces` com casos vazios e medidas;
   ROADMAP com a 009 integrada.
2. **Fundação**: `surface_sample` (refatoração do `surface_eval`, vértices bit a bit — hash do `extensionPoints`);
   `SurfaceCollider` + schemas; tipo `surface` no `ColliderSet` e no `collider_set.wgsl`; cursor de passo; testes;
   fixtures intactas.
3. **US1 terreno colidível**: `SurfaceColliderFlow` modo altura (cópias por passo); SPH/PBF/MPM; narrowphase LCP;
   XPBD/FEM/emissor; casos `terrain-bodies`, `terrain-fluids`, `terrain-animated` (30/60/144), `terrain-water` (lago,
   cáusticas, imagem).
4. **US2 superfície geral**: modo distância (semeadura, jump flooding, sinal); casos `torus-bodies`, `sphere-fluid`,
   `adhesion`.
5. **US3 geometria diferencial e adaptativa**: segundas derivadas (prontas analíticas, pontos opcionais, numéricas,
   espaço); pool diferencial; `SurfaceSample` e `forward_diff`; níveis, orçamento, colapso, prefixos, emissão; ramo
   indireto no forward/sombra; feature e `adaptiveUnavailable`; casos `curvature`, `curvature-material`, `adaptive`.
6. **US4 CPU**: normais da `ParametricGeometry`; `bigMesh`; caso `cpu-normals`.
7. **Docs**: arquitetura, guias, ROADMAP (F3 fechada), PENDENCIAS, JSDoc, API.
8. **Fechamento**: smokes (fonte e `--dist`), `bench:check`, `npm run ci`, baseline regravado, vídeos.

## Complexity Tracking

| Ponto                                    | Por que é necessário                                                                     | Alternativa mais simples rejeitada                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Cópia do campo por passo + cursor na GPU | Cada Flow repete os seus passos; sem cópia por passo, 30/60/144 Hz divergem              | Campo único por quadro — quebra FR-015 com superfície animada                       |
| Jump flooding para a distância           | Distância exata ao triângulo mais próximo em O(células · log N)                          | Força bruta célula × triângulo — 10⁹ operações por passo                            |
| Pool diferencial separado do vértice     | Mantém o vértice de 32 B, layouts, hashes e fixtures                                     | Vértice maior — muda forward, sombra, wire, sprites e todas as fixtures             |
| Argumentos indiretos compostos por passe | `firstInstance` do grupo é de cada passe; indireto com `firstInstance ≠ 0` exige feature | CPU escreve parte do registro da geometria — corrida entre CPU e kernel no buffer   |
| Colisão nova em XPBD/FEM/emissor         | FR-004 pede todos os solvers; hoje três não colidem com nada                             | Só a superfície nesses solvers — tipos de collider com regras diferentes por solver |
