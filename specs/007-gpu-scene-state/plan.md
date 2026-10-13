# Implementation Plan: Estado de cena na GPU e paridade de desempenho com o Three.js

**Branch**: `feature/007-gpu-scene-state` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-gpu-scene-state/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md)
(F2, item 007; puxados: broadphase da F5/015, envio por delta da F7/020) · Pendências:
[`specs/PENDENCIAS.md`](../PENDENCIAS.md) (E2, E3, E5; §0) · Diagnóstico: PR #38 · Baseline:
`bench/baselines/apple-metal-3-chrome155-macos-1280x720-ifpfky.json`

## Summary

Levar o estado de cena para a GPU e tirar da CPU todo trabalho por entidade no quadro, sem mudar imagem nem trajetória:

1. **Dedup de geometria (C2/C3)**: chave de conteúdo por geometria; mesma spec → mesma cópia (posse da C1); arrays das
   paramétricas gerados uma vez por chave (R1).
2. **Grupos de instâncias (C2)**: `slot.entities({ groups })` mantém por evento os grupos e a lista de instâncias na
   GPU; forward e sombra fazem um draw por grupo (R2–R4).
3. **Envio por delta (C2)**: espelho por pool, slot O(1), faixas contíguas, `poolWritten` agregado, crescimento por
   cópia na GPU, `entitiesChanged` agregado por quadro (R5, R6).
4. **Física na GPU (C2/C3)**: posse por conjunto (`owns`); pose publicada no pool de `Transform` pelo LCP; leitura sob
   demanda (`world.read`); fim do readback (R7, R8).
5. **Broadphase (C3)**: proxies, grade hash, pares candidatos, narrowphase indireta; mesmo conjunto de contatos (R9).
6. **Câmera, `Input`, controllers (C2/C3/C4)**: `Camera` + `Transform`, `CameraFlow`, pool de câmeras, `aspect` do
   canvas, `Input` Resource, controllers mutando o `Transform` (R10).
7. **Luz e sombra (C3/C4)**: forward lê o pool `Light`; `ShadowMatrixFlow` (R11).
8. **`Parent` (C3)**: composição por níveis (R12).
9. **Escala e medição**: `scale1m`, bench (adaptador, limitações), residual do SC-010 (R13–R15).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem dependências novas

**Storage**: N/A (fixtures de imagem e trajetória em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (happy-dom) com `countingCore` para dedup, grupos (invariantes), envio por faixas, posse, leitura,
eventos agregados, `Parent`, controllers; smokes de navegador (inclusive `--dist`): `render`, `trajectories`
(30/60/144 Hz), `rigidContacts` (conjunto de contatos contra a exaustiva), `churn`, `bigMesh`, `scale1m` (novo);
`npm run bench`, `npm run bench:check`

**Target Platform**: Chrome/Edge com WebGPU (perfil `apple-metal-3-chrome155-macos-1280x720-ifpfky`)

**Project Type**: biblioteca (engine)

**Performance Goals**: SC-001–SC-007 da spec — `instances/10k` 1 draw e CPU ≤ 1 ms; `100k`/`1m` ≤ 1,5× a de `10k`;
`10k-moving` CPU ≤ 3 ms; `rigid-bodies/10k` fps ≥ Three + Rapier, p99 ≤ 1,5× a média, pares ≤ 1% de N·M; GPU de
`instances/10k` ≤ 0,52 ms ou causa registrada

**Constraints**: sem helpers; dispatch só grava; nada por entidade no quadro com a cena parada; imagem idêntica (ou
tolerância de R10 aprovada); trajetória bit a bit; nomes explícitos (minificação); fronteira D4; C1 inalterada (usa
`create`/`write`/`readback`, a posse por spec, `Frame.copy` e `workgroupsIndirect` já existentes)

**Scale/Scope**: C2 — `slots.ts` (`groups`, `owns`), `ResourceSystem` (dedup, espelho, faixas, posse, leitura, cópia
no crescimento), `FlowRuntime`/`FlowBinder` (grupos, `poolWritten`, agregação), `World.read`, `Input`; C3 — geometrias
(`contentKey`, cache), `Camera`, `CameraFlow`, `ShadowMap`, `ShadowMatrixFlow`, `Parent`, `TransformFlow`, `LCPFlow`,
kernels (`rb_collider_proxies`, grade hash, `rb_candidate_pairs`, narrowphase indireta, `rb_publish_pose`,
`camera_compose`, `shadow_matrix`, `transform_compose` por nível), `wgslLib.camera`; C4 — forward, sombra, shaders,
`ForwardFrameParams`, controllers, `InteractionSystem`, `Application`; bench (adaptador, limitações); smokes; docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                                                      | Status |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Grupos, posse, espelho, leitura e dedup na C2; a C2 agrupa por chave do estágio sem conhecer render; C3/C4 só por `scene/`; nenhum valor da C1 atravessa                                       | ✅     |
| **II. Domínio na borda**        | Autoria inalterada (geometria, material, `Transform`); câmera ganha vocabulário de domínio (`projection`, `fov`, `aspectMode`); `Parent` por entidade; `world.read` devolve o `data` do schema | ✅     |
| **III. Resource como contrato** | `Input`, `Parent` e controllers como Resources; matrizes de câmera e sombra como descritores; nenhum estágio cria cópia de dado de cena                                                        | ✅     |
| **IV. ECS e Flows**             | Câmera, matriz da sombra e pose como Flows/kernels em fases fixas com prioridade; listas mantidas por eventos                                                                                  | ✅     |
| **V. Testes**                   | Testes CPU para dedup, grupos, faixas, posse, leitura, eventos, `Parent`, controllers; GPU por smokes (imagem, trajetória, contatos, escala), inclusive no dist                                | ✅     |
| **VI. Documentação**            | Documento de arquitetura (pools, grupos, posse, leitura, câmera, `Input`, `Parent`), guias, migração, JSDoc, API regenerada                                                                    | ✅     |
| **Restrições técnicas**         | Sem deps; backend substituível (só o contrato `EngineCore`); incompatibilidades (0.x) no guia de migração                                                                                      | ✅     |
| **Quality gates**               | Ordem do CI inalterada                                                                                                                                                                         | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — os contratos ([scene-state.md](./contracts/scene-state.md),
[render-stages.md](./contracts/render-stages.md), [physics-gpu.md](./contracts/physics-gpu.md)) mantêm a C1 sem
mudança, concentram agrupamento, posse e envio na C2 e deixam a semântica (chave do grupo, matemática de câmera,
broadphase) nos estágios da C3/C4.

## Project Structure

### Documentation (this feature)

```text
specs/007-gpu-scene-state/
├── plan.md
├── research.md          # Achados A1–A15, decisões R1–R15
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── scene-state.md   # dedup, grupos, envio por delta, posse, leitura, eventos agregados
│   ├── render-stages.md # forward, sombra, CameraFlow, ShadowMatrixFlow, TransformFlow, controllers
│   └── physics-gpu.md   # publicação da pose, broadphase, garantias
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── scene/                                  # C2
│   ├── flows/slots.ts                      # groups, owns; DrawGroup; BoundEntities.groups/instances
│   ├── systems/ResourceSystem.ts           # dedup por contentKey; espelho, slotOfResource, faixas; posse; cópia no crescimento; read
│   ├── systems/flowBinding/                # grupos e segmentos; poolWritten; entitiesChanged agregado
│   ├── world/World.ts                      # read/readAll
│   ├── input/Input.ts                      # NOVO (movido da C4) — Resource singleton
│   └── SceneContext.ts                     # SingletonResolver('Input'); resolvers de câmera por slot ativo
├── elements/                               # C3
│   ├── geometry/*.ts                       # contentKey; cache de conteúdo por chave
│   ├── scene/Camera.ts, CameraFlow.ts      # params + matrices; kernel camera_compose
│   ├── scene/ShadowMap.ts, ShadowMatrixFlow.ts
│   ├── scene/Parent.ts                     # NOVO
│   ├── scene/flows/TransformFlow.ts        # níveis
│   ├── physics/flows/LCPFlow.ts            # poses/owns, broadphase, narrowphase indireta, sem readback
│   ├── gpu/SpatialHashGrid.ts              # NOVO — variante hash da busca de vizinhança
│   └── gpu/wgsl/kernels/                   # rb_collider_proxies, rb_candidate_pairs, rb_publish_pose, camera_compose, shadow_matrix, sh_*.wgsl
├── presentation/                           # C4
│   ├── flows/ForwardFlow.ts, ShadowFlow.ts # grupos; ForwardFrameParams
│   ├── input/*                             # devices escrevem no Input da C2; controllers com tick(input, dt, transform)
│   └── app/Application.ts                  # Input no World; aspect do canvas
└── __smokes__/scale1m.ts                   # NOVO

bench/engines/clayflow.ts, bench/scenes/*/clayflow.ts   # câmera Camera + Transform; limitações
clay-engine-doc/docs/guides/                            # arquitetura, flows, câmera/input, migração
specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; mecanismos genéricos na C2 primeiro, consumidos por contrato; cada consumidor
migrado com imagem e trajetória verdes a cada passo.

## Fases de implementação (para `/speckit-tasks`)

1. **Base de verificação**: números de hoje (draws, buffers de geometria, escritas por quadro, leituras, pares); teste
   de igualdade do conjunto de contatos (exaustiva × candidata, por substep) com a exaustiva como referência; smoke
   `scale1m` registrando o estado atual; medição de imagem da câmera em `f32` (R10) antes de tocar no render.
2. **Fundação C2**: slot O(1) + espelho + faixas + `poolWritten` + cópia no crescimento (R5); `entitiesChanged`
   agregado (R6); dedup por `contentKey` (R1); `groups` (R2); `owns` (R7); `world.read` (R8).
3. **US2 envio por delta** sobre os consumidores (`TransformFlow` por `poolWritten`; fim do `resourceReady` de pool).
4. **US1 instâncias**: geometrias com `contentKey` e cache; forward e sombra por grupos; imagem idêntica.
5. **US3 física**: publicação da pose e posse; fim do readback; leitura nos smokes; broadphase (proxies, grade hash,
   pares, narrowphase indireta) com o teste de conjunto de contatos verde; trajetórias bit a bit.
6. **US4 câmera e `Input`**: `Camera` params/matrices, `CameraFlow`, pool, `aspect`; `Input` na C2; controllers; bench e
   smokes com `Camera` + `Transform`; imagem.
7. **US6 luz e sombra**: forward pelo pool `Light`; `ShadowMatrixFlow`; imagem.
8. **US5 `Parent`**.
9. **US7 escala**: `scale1m`; `instances/1m` no bench; redução de estruturas por entidade se o heap passar da meta.
10. **US8 residual de GPU** (R14).
11. **Docs**: arquitetura (pools, grupos, posse, leitura, câmera, `Input`, `Parent`, broadphase), guias, migração,
    ROADMAP (vertex pulling/arena → F7, R4), PENDENCIAS (E2, E3, E5 resolvidos), JSDoc, API.
12. **Fechamento**: smokes (fonte e `--dist`), bench por cena contra as metas, `bench:check`, gate completo, baseline
    regravado.

## Complexity Tracking

| Ponto                                         | Por que é necessário                                                                            | Alternativa mais simples rejeitada                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Broadphase trazida da F5                      | Sem ela `rigid-bodies/10k` fica com 28 ms de GPU; o pedido é paridade                           | Esperar a F5 — mantém a cena travada                                                 |
| Envio por delta trazido da F7                 | `10k-moving` gasta 199 ms em envios por objeto e varredura O(N²)                                | Só o mapa de slot — resolve o O(N²), mas mantém 10 mil escritas e eventos por quadro |
| Grupos mantidos pela C2 em vez do estágio     | O agrupamento é genérico (forward, sombra, futuros estágios) e precisa dos eventos da C2        | Agrupar no `dispatch` — percorre entidades a cada quadro (o que se quer tirar)       |
| Vertex pulling e arena adiados para a F7 (R4) | Sem indireto múltiplo não há ganho; o layout de 32 B não é legível em storage sem offsets à mão | Fazer agora — +50% de memória de vértice ou offsets à mão, sem ganho medido          |
