# Implementation Plan: Geometria em compute — partículas, fluidos e corpos moles na tela

**Branch**: `feature/008-compute-geometry` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-compute-geometry/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md)
(F2, item 008) · Pendências: [`specs/PENDENCIAS.md`](../PENDENCIAS.md) (§4 "Geometria gerada em compute"; P10 e E4
citados) · Baseline: `bench/baselines/apple-metal-3-chrome155-macos-1280x720-ifpfky.json`

## Summary

Fechar a F2: o que a simulação produz na GPU vira imagem na GPU, e a geometria pode ser produzida por compute.

1. **Faixas de pool (C2)**: descritor em pool com `count`; um Resource ocupa N slots contíguos; alocador de intervalos;
   empacotamento SoA → AoS; leitura da faixa (R1).
2. **Vivos na GPU (C2)**: bitset de ocupação por pool, `pool_live` nos kernels de partícula e na vizinhança (R2).
3. **Referências de slot (C2)**: `FieldType.slotRef`, resolvidas e reempacotadas pela C2; `DistanceConstraint` por
   `(corpo, índice)`; `edges` internas do `SoftBody` (R3).
4. **Corpos-contêiner (C3)**: `ParticleBody` base; `FluidBody`/`SoftBody` com arrays; teto validado (R10, R12).
5. **Sprites de corpos (C4)**: `ParticleFlow` lendo o pool pelo índice da instância (R4).
6. **Superfície de corpo mole (C3)**: `SurfaceGeometry` escrita por `SoftSurfaceFlow` (normais por kernel) e desenhada
   pelo forward e pela sombra (R5).
7. **Geometria da GPU (C2/C3)**: `indexFormat`, `owns` em descritor individual, `PointCloudGeometry` desenhável, draw
   não indexado e indireto (R6).
8. **Topologia (C3/C4)**: topologia e `castsShadow` no material; arestas por kernel; sprites de vértice no forward;
   sombra por material (R7).
9. **Verificação**: trajetórias com contêineres (fixture inalterada, R9), fixtures de render regravadas (R8), smokes
   novos, bench `particles` (R11).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem dependências novas

**Storage**: N/A (fixtures de imagem e trajetória em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (happy-dom) com `countingCore` para faixas (alocação, coalescência, crescimento, empacotamento
SoA, leitura), bits de vivo, `slotRef` (resolução, reempacotamento, erros), validação de corpos, grupos com topologia,
posse de descritor individual, draws por corpo; smokes de navegador (inclusive `--dist`): `trajectories` (fixture
inalterada), `render` (regravadas), `particles`, `softSurface`, `pointCloud` (novos); `npm run bench`, `bench:check`

**Target Platform**: Chrome/Edge com WebGPU (perfil `apple-metal-3-chrome155-macos-1280x720-ifpfky`)

**Project Type**: biblioteca (engine)

**Performance Goals**: SC-003–SC-005 — 1 draw por corpo; CPU por quadro de `particles/65k` ≤ 1,5× a de `4k`;
`particles/65k` ≥ 60 fps em 1280×720 com simulação e render

**Constraints**: sem helpers; dispatch só grava; nada por partícula na CPU por quadro; nenhuma leitura de volta por
quadro; trajetórias bit a bit; imagens existentes idênticas salvo a caixa de arame (R8); nomes explícitos (minificação);
fronteira D4; C1 inalterada (usa draw não indexado/indireto, pipeline sem vertex buffers e usages já existentes)

**Scale/Scope**: C2 — `GPUDescriptor` (`count`, `indexFormat`), `StructSchema` (`packRange`, `unpackRange`,
`FieldType.slotRef`), `ResourceSystem` (faixas, alocador de intervalos, vivos, `slotRef`, leitura, posse individual),
`slots.ts` (`rangeOf`, `live`, `owns` individual), `wgslLib.poolLive`; C3 — `ParticleBody`, `FluidBody`, `SoftBody`,
`DistanceConstraint`, `SurfaceGeometry`, `PointCloudGeometry`, `Material` (`topology`, `castsShadow`),
`PointSpriteMaterial` (struct próprio), solvers (`pool_live`), `SoftSurfaceFlow`, kernels (`soft_face_normals`,
`soft_vertex_write`, `edges_from_triangles`); C4 — `ParticleFlow`, `ForwardFlow`, `ShadowFlow`, shaders
(`particle_sprite.wgsl`, sprite de vértice, forward com topologia), `defaults.ts`; smokes; bench; docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                                           | Status |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Faixas, vivos, `slotRef` e posse na C2, genéricos (sem saber de partícula); corpos, superfície e kernels na C3; estágios de desenho na C4; nada da C1 atravessa                     | ✅     |
| **II. Domínio na borda**        | Autoria por arrays de domínio (`position`, `mass`, `edges`, `surface`) e restrições por `(corpo, índice)`; o layout de pool fica no núcleo                                          | ✅     |
| **III. Resource como contrato** | Corpo é um Resource com faixa; superfície e nuvem de pontos são `Geometry` com descritores; restrições internas são descritores do corpo; nenhum estágio cria cópia de dado de cena | ✅     |
| **IV. ECS e Flows**             | `ParticleFlow`, `SoftSurfaceFlow` e o kernel de arestas como Flows em fases fixas; listas por eventos; dispatch só grava                                                            | ✅     |
| **V. Testes**                   | CPU para faixas, vivos, `slotRef`, validação, grupos, posse; GPU por smokes de imagem, trajetória e movimento, inclusive no dist                                                    | ✅     |
| **VI. Documentação**            | Documento de arquitetura (faixas, vivos, `slotRef`, render de corpos, geometria da GPU, topologia), guias, migração, ROADMAP, PENDENCIAS, JSDoc, API regenerada                     | ✅     |
| **Restrições técnicas**         | Sem deps; backend substituível; incompatibilidades (0.x: corpos por arrays, `DistanceConstraint`, `PointCloudGeometry`) no guia de migração                                         | ✅     |
| **Quality gates**               | Ordem do CI inalterada                                                                                                                                                              | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — os contratos ([pool-ranges.md](./contracts/pool-ranges.md),
[render-stages.md](./contracts/render-stages.md)) mantêm a C1 sem mudança, concentram alocação, vivos e referências na
C2 sem semântica de domínio e deixam a semântica (posição, normais, sprites, topologia) na C3/C4.

## Project Structure

### Documentation (this feature)

```text
specs/008-compute-geometry/
├── plan.md
├── research.md          # Achados A1–A18, decisões R1–R12
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── pool-ranges.md   # faixas, vivos, slotRef, leitura
│   └── render-stages.md # ParticleFlow, SoftSurfaceFlow, forward/sombra com topologia, geometria da GPU
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── scene/                                   # C2
│   ├── descriptors/GPUDescriptor.ts         # count em pool; indexFormat
│   ├── descriptors/StructSchema.ts          # packRange/unpackRange
│   ├── descriptors/FieldType.ts             # slotRef
│   ├── systems/ResourceSystem.ts            # faixas, intervalos livres, vivos, slotRef, leitura da faixa, posse individual
│   ├── flows/slots.ts                       # rangeOf, live, owns individual
│   └── shaders/ (wgslLib)                   # poolLive
├── elements/                                # C3
│   ├── physics/bodies/ParticleBody.ts       # NOVO — base dos contêineres
│   ├── physics/bodies/FluidBody.ts, SoftBody.ts
│   ├── physics/constraints/DistanceConstraint.ts
│   ├── physics/flows/{SPH,PBF,MPM,XPBD,FEM}Flow.ts + kernels   # pool_live; teto validado
│   ├── physics/flows/SoftSurfaceFlow.ts     # NOVO
│   ├── geometry/SurfaceGeometry.ts          # NOVO
│   ├── geometry/PointCloudGeometry.ts
│   ├── material/{Material,PointSpriteMaterial,WireframeMaterial}.ts
│   └── gpu/wgsl/kernels/                    # soft_face_normals, soft_vertex_write, edges_from_triangles
├── presentation/                            # C4
│   ├── flows/ParticleFlow.ts                # NOVO
│   ├── flows/ForwardFlow.ts, ShadowFlow.ts  # topologia, sprites de vértice, arestas, sem índices, sombra por material
│   ├── flows/defaults.ts
│   └── (wgsl) particle_sprite, point_sprite, forward
└── __smokes__/particles.ts, softSurface.ts, pointCloud.ts   # NOVOS; trajectories.ts e render.ts atualizados

bench/scenes/particles/{clayflow,three}.ts   # NOVA
clay-engine-doc/docs/guides/                 # arquitetura, flows, física, migração
specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; mecanismos genéricos na C2 primeiro (faixas, vivos, `slotRef`, posse),
consumidos por contrato; trajetórias verdes a cada passo da migração dos corpos.

## Fases de implementação (para `/speckit-tasks`)

1. **Base de verificação**: teste que reproduz o defeito A3 (slot liberado simulado); números de hoje (draws de
   partícula = 0, leituras por quadro); smoke `render` com a caixa de arame isolada para medir a diferença esperada.
2. **Fundação C2**: `count` em pool + `packRange`/`unpackRange` + alocador de intervalos + leitura da faixa (R1); bits de
   vivo + `poolLive` (R2); `slotRef` (R3); `indexFormat` e `owns` individual (R6). Trajetórias e todos os testes verdes
   com `count = 1`.
3. **US2 contêineres**: `ParticleBody`, `FluidBody`/`SoftBody` com arrays e `edges`, `DistanceConstraint` por
   `(corpo, índice)`, solvers com `pool_live`, teto validado; `trajectories` com contêineres e fixture inalterada;
   testes migrados.
4. **US1 sprites**: `PointSpriteMaterial` com struct próprio; `ParticleFlow`; smoke `particles` (SPH, PBF, MPM fluido e
   sólido) com referência e movimento; contagem de draws e de leituras.
5. **US3 superfície**: `SurfaceGeometry`, `SoftSurfaceFlow`, kernels de normais; smoke `softSurface` (tecido XPBD com
   malha e sombra; FEM como sprites).
6. **US4 geometria da GPU**: `PointCloudGeometry` com `vertices` `'never'`, draw não indexado/indireto, aviso de
   geometria sem escritor; smoke `pointCloud`.
7. **US5 topologia**: `topology`/`castsShadow`; forward por topologia (arestas por kernel, sprites de vértice); sombra
   por material; testes de grupos; fixtures `render-*` regravadas num commit próprio com a diferença descrita.
8. **Bench**: cena `particles` (4k, 65k) clayflow × Three; limitação declarada.
9. **Docs**: arquitetura (faixas, vivos, `slotRef`, render de corpos, geometria da GPU, topologia), guias, migração,
   ROADMAP (008 entregue; linhas desatualizadas do diagnóstico), PENDENCIAS (§4 resolvida, P10 precisa), JSDoc, API.
10. **Fechamento**: smokes (fonte e `--dist`), bench contra as metas, `bench:check`, gate completo, baseline regravado.

## Complexity Tracking

| Ponto                              | Por que é necessário                                                                       | Alternativa mais simples rejeitada                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Alocador de intervalos na C2       | Contêiner = N slots contíguos; o render e as restrições usam `first + índice`              | Uma entidade por partícula — mantém o custo por partícula e não dá identidade ao corpo      |
| Bitset de vivos                    | Faixas liberadas não podem ser simuladas nem entrar na vizinhança (defeito A3 já presente) | Compactar — move corpos vivos e invalida referências                                        |
| `slotRef` resolvido pela C2        | Com faixas alocadas pela C2, o autor não conhece o slot absoluto                           | Somar `first` no kernel do XPBD — só serve ao XPBD e exige o corpo de cada restrição na GPU |
| `ParticleFlow` separado do forward | Corpo não é `Geometry`; o desenho lê o pool por stride/offset do schema                    | Copiar posições para vertex buffer por quadro — cópia contra o modelo alvo (A18)            |
| Fixtures de render regravadas      | A topologia correta muda a caixa de arame presente em todas as cenas                       | Manter o arame como triângulos — contraria a FR-017                                         |
