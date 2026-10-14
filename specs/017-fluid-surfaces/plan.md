# Implementation Plan: Superfície de fluido — água contínua com cáusticas

**Branch**: `feature/017-fluid-surfaces` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-fluid-surfaces/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md)
(F5, item 017; 029 reusa a óptica e as cáusticas) · Pendências: [`specs/PENDENCIAS.md`](../PENDENCIAS.md) (P10) ·
Baseline: o regravado na 008

## Summary

Água contínua a partir das partículas, com óptica de água e cáusticas, toda na GPU:

1. **Material (C3)**: `FluidSurfaceMaterial` com struct próprio; o `ParticleFlow` o ignora sem aviso (R10).
2. **Superfície genérica (C4)**: Resource `WaterSurface` por cena, texturas sob demanda (R9); extensão da C2:
   `ensureAllocated` de texturas.
3. **Produtor de partículas (C4)**: `FluidSurfaceFlow` em duas vistas — câmera (profundidade, espessura, material,
   suavização; R2–R4) e luz (R6).
4. **Cáusticas (C4)**: `CausticsFlow` por fótons em espaço da luz, ponto fixo determinístico (R7); o forward multiplica a
   luz direta pelo mapa abaixo da água (R8).
5. **Óptica (C4)**: `WaterFlow` compõe refração, absorção, dispersão, Fresnel, especular e sombra nos alvos da cena,
   com MSAA (R5).
6. **Verificação**: smoke `fluidSurface` com fixtures por caso, variantes `*-water` no bench, imagens e trajetórias
   existentes idênticas (R14).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem dependências novas

**Storage**: N/A (fixtures de imagem em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (happy-dom, `countingCore`) para o material, o `WaterSurface` sob demanda, `ensureAllocated` de
textura, seleção de corpos e ordem dos estágios, `ForwardFrameParams`; smokes de navegador (inclusive `--dist`):
`fluidSurface` (novo), `render`, `particles`, `softSurface`, `pointCloud`, `trajectories` (inalterados); `npm run
bench`, `bench:check`

**Target Platform**: Chrome/Edge com WebGPU (perfil de referência Apple Metal 3, Chrome 155)

**Project Type**: biblioteca (engine)

**Performance Goals**: SC-005 — barragem 36 864 com água e cáusticas ≥ 60 fps; superfície + cáusticas ≤ 3 ms de GPU a
mais que sprites com 65 536 partículas, 1280×720

**Constraints**: sem helpers; dispatch só grava; nenhuma leitura de volta; nada por partícula na CPU por quadro;
trajetórias bit a bit; imagens existentes idênticas (fator de cáustica 1 exato sem água); nomes explícitos
(minificação); fronteira D4; C1 inalterada (A9)

**Scale/Scope**: C2 — `ResourceDirectory.ensureAllocated` (texturas); C3 — `FluidSurfaceMaterial` + schema;
C4 — `WaterSurface`, `FluidSurfaceFlow`, `CausticsFlow`, `WaterFlow`, `ForwardFlow` (cáusticas), `ParticleFlow`
(ignora água), `defaults.ts`, shaders `water_surface.wgsl`, `water_smooth.wgsl`, `caustics.wgsl`,
`water_composite.wgsl`, `forward.wgsl`; smoke; bench; docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                   | Status |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Alocação sob demanda de textura na C2, genérica; material na C3; estágios e alvos na C4; C1 intocada e acessada só pelos reexports de `scene/contracts/gpu` | ✅     |
| **II. Domínio na borda**        | Autoria pelo material (cor, absorção, índice de refração); texturas e fótons ficam no núcleo                                                                | ✅     |
| **III. Resource como contrato** | Superfície, cáusticas e fótons são descritores de um Resource (`WaterSurface`) alocados pela C2; o material é um Resource em pool                           | ✅     |
| **IV. ECS e Flows**             | Três estágios em fases fixas, ligados por slots e eventos (`entitiesChanged`, `canvasReconfigured`, `poolReallocated`); dispatch só grava                   | ✅     |
| **V. Testes**                   | CPU para material, alocação, seleção e ordem; GPU por smoke de imagem com fixtures por caso, inclusive no dist                                              | ✅     |
| **VI. Documentação**            | Arquitetura (superfície genérica, estágios, cáusticas no forward), guias, ROADMAP, PENDENCIAS (P10), JSDoc, API                                             | ✅     |
| **Restrições técnicas**         | Sem deps; backend substituível; mudança de API compatível (só acréscimos; `ensureAllocated` amplia o retorno)                                               | ✅     |
| **Quality gates**               | Ordem do CI inalterada                                                                                                                                      | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/water-stages.md) separa produtor (partículas) de
consumidores (óptica, cáusticas) por uma superfície genérica (FR-031); a C1 não muda; a C2 só ganha alocação sob
demanda de textura, sem semântica de água.

## Project Structure

### Documentation (this feature)

```text
specs/017-fluid-surfaces/
├── plan.md
├── research.md          # Achados A1–A10, decisões R1–R15
├── data-model.md
├── quickstart.md
├── contracts/water-stages.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── scene/                                    # C2
│   ├── contracts/ResourceDirectory.ts        # ensureAllocated: textura
│   └── systems/ResourceSystem.ts
├── elements/                                 # C3
│   ├── material/FluidSurfaceMaterial.ts      # NOVO (+ FluidSurfaceMaterialSchema.ts)
│   ├── material/forwardSchemas.ts            # causticsEnabled; WaterViewParams, CausticParams, WaterCompositeParams
│   ├── material/shaders.ts                   # módulos da água
│   └── gpu/wgsl/                             # water_surface, water_smooth, caustics, water_composite; forward
├── presentation/                             # C4
│   ├── app/WaterSurface.ts                   # NOVO
│   ├── flows/FluidSurfaceFlow.ts             # NOVO
│   ├── flows/CausticsFlow.ts                 # NOVO
│   ├── flows/WaterFlow.ts                    # NOVO
│   ├── flows/ForwardFlow.ts, ParticleFlow.ts # cáusticas; ignora água
│   └── flows/defaults.ts                     # registros e WaterSurface
└── __smokes__/fluidSurface.ts                # NOVO

bench/scenes/particles/{scene,clayflow,three}.ts   # variantes *-water
clay-engine-doc/docs/guides/                        # arquitetura, flows, materiais
specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; o produtor de partículas e os consumidores genéricos separados desde o início,
para a 029 escrever a mesma superfície.

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: números de hoje (`particles/64k` GPU, imagens `render`/`particles`); cena de teste do smoke com tanque,
   luz com sombra e barragem.
2. **Fundação**: `ensureAllocated` de textura (C2); `FluidSurfaceMaterial`; `WaterSurface`; `ParticleFlow` ignora água;
   registro dos estágios (vazios) e ordem nas fases; testes.
3. **US1 superfície**: `FluidSurfaceFlow` câmera (esferas, espessura, suavização); `WaterFlow` com sombreamento básico
   (normal, luz, sombra); smoke de continuidade (SPH, PBF, MPM).
4. **US2 óptica**: refração com `background`, absorção, dispersão, Fresnel, especular; câmera dentro da água; smoke de
   refração/absorção em três profundidades e ângulo rasante.
5. **US3 cáusticas**: vista da luz; `CausticsFlow` (fótons, resolução); forward com `causticsEnabled`; smoke agitada ×
   plana × sem água, objeto submerso; imagens existentes idênticas.
6. **US4 coexistência**: sprites + água, troca de material em execução, dois materiais, nenhum custo sem água.
7. **US5 medição**: variantes `4k-water`/`64k-water` no bench; metas do SC-005.
8. **Docs**: arquitetura, guias, ROADMAP (017 entregue), PENDENCIAS (P10 resolvida), JSDoc, API.
9. **Fechamento**: smokes (fonte e `--dist`), `bench:check`, gate completo, baseline regravado; vídeos dos resultados
   para o usuário.

## Complexity Tracking

| Ponto                                  | Por que é necessário                                                              | Alternativa mais simples rejeitada                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Duas vistas do mesmo produtor          | As cáusticas precisam da superfície vista pela luz                                | Cáusticas por textura animada — não seguem a água nem a luz (contraria FR-015/FR-016) |
| Fótons com atomics em ponto fixo       | Soma independente da ordem: imagem determinística (fixtures) e energia conservada | Pontos com blend aditivo em float — ordem de rasterização muda o último bit           |
| Cópia `color` → `background`           | A composição não pode ler a textura em que resolve                                | Refratar a própria cor do alvo — leitura e escrita no mesmo passe                     |
| Mudança no forward (fator de cáustica) | A luz direta é a do forward; cáustica é transmissão da luz, como a sombra         | Multiplicar a cor final na tela — escurece/clareia também o ambiente e o especular    |
| `WaterSurface` sob demanda             | Sem água, nenhuma memória nem passe (FR-023)                                      | Alocar sempre com `FrameTargets` — ~20 MiB parados em toda cena                       |
