# Implementation Plan: Iluminação global (luz rebatida)

**Branch**: `feature/033-global-illumination` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/033-global-illumination/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md)
(F4, 033) · Base: a 011 (fechamento, `scene_lighting`, pontos por luz) e a 031 (pontos de cena, composição de funções)

## Summary

A luz rebatida da cena, física e estável, sem mudar materiais nem desenho:

1. **Estrutura de raios (C3)**: BVH de dois níveis construída e reajustada na GPU — BLAS por conteúdo de geometria
   (triângulos de malhas, superfícies e grafos; esferas das partículas), TLAS sobre as instâncias por quadro — e o
   módulo de consulta `ray_scene` como recurso da cena (R1). Serve depois ao débito R1 da 011.
2. **Céu físico (C3)**: atmosfera de Hillaire em compute ligada ao sol, fonte dos raios que escapam, fundo da cena e
   transmitância do sol pelo ponto `light_transmission` (R4).
3. **Luz difusa rebatida (C3)**: sondas em cascatas com rastreamento, amostragem das fontes e multiplos rebatimentos pelo
   quadro anterior; irradiância e visibilidade octaédricas contra o vazamento; acúmulo no espaço das sondas (R2, R5, R6).
4. **Materiais nos acertos (C3)**: as funções `material` da cena compostas num kernel de compute (R3).
5. **Cáusticas (C3)**: fótons das fontes pelos caminhos especulares até a primeira difusa, num hash espacial (R2).
6. **Integração (C3/C4)**: contribuição da iluminação global ao `scene_lighting` (`closure_indirect`), o hemisfério
   retirado enquanto ela existe, o céu desenhado como fundo (R7).
7. **Verificação**: traçador de caminhos na CPU para a Cornell box e cenas simples; smokes com medidas; vídeos (R8).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU (compute, storage buffers grandes, atômicos); sem dependências novas

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (`countingCore`): descritores e estados da `RayScene` (build, refit, rebuild), TLAS por quadro,
composição das funções `material` no kernel de acertos, `Sky` (tabelas regeneradas por mudança), `GlobalIllumination`
(validação, qualidade, retirada do hemisfério por evento, contribuição ao `scene_lighting`), referências de CPU (LBVH,
travessia, atmosfera, traçador de caminhos); smokes de navegador (fonte e `--dist`): `rayScene` (interseções contra a
analítica, refit de geometria viva), `sky` (contra o modelo), `globalIllumination` (Cornell box contra o traçador,
energia, vazamento, convergência, estabilidade, resposta, geometria viva, cáusticas); todos os existentes; `bench:check`;
`npm run ci`

**Target Platform**: Chrome/Edge com WebGPU (perfil de referência Apple Metal 3)

**Project Type**: biblioteca (engine)

**Performance Goals**: iluminação global ≤ 4 ms de GPU a 1280×720 com 1 milhão de triângulos (qualidade `medium`,
perfil de referência); refit de uma superfície de 1 milhão de triângulos ≤ 1 ms; TLAS de 10 mil instâncias ≤ 0,3 ms;
cenas sem iluminação global sem regressão no `bench:check`

**Constraints**: sem helpers (Resource + evento + Flow); dispatch só grava; nenhuma leitura de volta por quadro;
trajetórias bit a bit; um símbolo WGSL por pipeline; contrato de shader da 031; C3/C4 importam só a C2; sem ciclos

**Scale/Scope**: C3 (`RayScene` e os estágios de build/refit, `ray_scene.wgsl`, `Sky` e tabelas, `GlobalIllumination`,
sondas, fótons, kernel de acertos com as funções `material`, contribuições); C4 (passe do céu, retirada do hemisfério nos
estágios padrão); C2 (o que a composição das funções `material` num kernel exigir, genérico); smokes; bench; docs

## Constitution Check

| Princípio                       | Avaliação                                                                                                    | Status |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| **I. Camadas e importação**     | Estrutura de raios, céu, sondas e fótons na C3; passe do céu e defaults na C4; nada da C1 além dos reexports | ✅     |
| **II. Domínio na borda**        | Autoria por sol, céu, qualidade e rebatimentos; nós, sondas e hash são internos                              | ✅     |
| **III. Resource como contrato** | `RayScene`, `Sky`, `GlobalIllumination` com descritores; recursos declarados nos módulos                     | ✅     |
| **IV. ECS e Flows**             | Build/refit/TLAS, tabelas do céu, sondas e fótons em Flows com transições; dispatch só grava                 | ✅     |
| **V. Testes**                   | CPU para descritores, estados e referências; GPU por smokes com medidas (fonte e dist)                       | ✅     |
| **VI. Documentação**            | Guias de iluminação global e de raios; arquitetura (ordem dos passes); ROADMAP; PENDENCIAS                   | ✅     |
| **Restrições técnicas**         | Sem deps; API por acréscimo (cenas sem os Resources novos como na 011)                                       | ✅     |
| **Quality gates**               | `npm run ci` + smokes (fonte e `--dist`) + `bench:check`                                                     | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/global-illumination.md) não muda materiais nem estágios
de desenho; a luz indireta chega pelo ponto de cena da 011; o hemisfério sai por evento dos estágios padrão.

## Project Structure

### Documentation (this feature)

```text
specs/033-global-illumination/
├── plan.md
├── research.md          # Achados, decisões R1–R10
├── data-model.md
├── quickstart.md
├── contracts/global-illumination.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/elements/raytrace/RayScene.ts, RaySceneFlow.ts, shaders.ts (NOVOS)          # BLAS/TLAS, build, refit, consulta
src/elements/gpu/wgsl/raytrace/*.wgsl (NOVOS)                                 # morton, lbvh, refit, tlas, ray_scene
src/elements/scene/Sky.ts, SkyFlow.ts (NOVOS); points/skyContribution.ts       # atmosfera, tabelas, transmitância do sol
src/elements/gpu/wgsl/sky/*.wgsl (NOVOS)
src/elements/lighting/GlobalIllumination.ts, ProbeFlow.ts, PhotonFlow.ts (NOVOS)
src/elements/gpu/wgsl/gi/*.wgsl (NOVOS)                                       # sondas, acertos, fótons, contribuição
src/elements/gpu/wgsl/math/closure_eval.wgsl                                  # closure_indirect
src/elements/material/point/shaders.ts                                        # composição das funções no kernel de acertos
src/scene/shaders/WgslPoint.ts (ou vizinho)                                   # composição genérica de funções por entidade num kernel
src/elements/geometry/SurfaceFlow.ts, scene/graph/GraphFlow.ts, physics/flows/SoftSurfaceFlow.ts  # produced('vertices')
src/presentation/flows/SkyPassFlow.ts (NOVO), defaults.ts                     # céu como fundo, hemisfério por evento
src/__smokes__/rayScene.ts, sky.ts, globalIllumination.ts (NOVOS) + support/pathTracer.ts (NOVO)
bench/scenes/global-illumination (NOVA)
clay-engine-doc/docs/guides/ (iluminação global, raios, arquitetura), specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; tudo da luz e dos raios na C3 (elementos), o passe de fundo e a política do
hemisfério na C4; a C2 só ganha o que a composição genérica de funções de ponto em compute exigir.

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: estado de partida (ci, smokes, bench); referências de CPU (LBVH, travessia, atmosfera, traçador de
   caminhos); smokes vazios.
2. **Fundação — estrutura de raios**: marca `produced('vertices')` nos estágios de geometria (A3); `RayScene`, cópia das
   primitivas para os buffers únicos, BLAS (LBVH: Morton, ordenação radix, hierarquia, caixas), refit e rebuild,
   esferas das partículas, TLAS por quadro, `ray_scene.wgsl`; smoke `rayScene` (interseções contra a analítica, geometria
   viva, 1 milhão de triângulos).
3. **US2 céu físico**: `Sky`, tabelas, transmitância do sol, passe do céu; smoke `sky`.
4. **US1 luz rebatida**: `GlobalIllumination`, sondas (rastreamento, acertos com as funções `material`, irradiância e
   visibilidade, relocação, cascatas), contribuição `closure_indirect`, hemisfério por evento; Cornell box contra o
   traçador, energia, cantos, tingimento.
5. **US4 estabilidade e vazamento**: histerese adaptativa, convergência, resposta, caixa fechada.
6. **US3 geometria viva e escala**: superfícies animadas, corpos moles, grafos, partículas; 1 milhão de triângulos.
7. **US5 cáusticas**: fótons pelos caminhos especulares, hash espacial; esfera de vidro, anel metálico.
8. **US6 raios para outros usos**: contrato documentado; estágio de teste.
9. **Fixtures**: as que mudam (céu como fundo quando usado; nenhuma cena existente usa os Resources novos — não mudam).
10. **Docs**: guias, arquitetura, ROADMAP (033 implementada; débito R1 da 011 em seguida), PENDENCIAS.
11. **Fechamento**: smokes (fonte e `--dist`), `bench:check`, `npm run ci`, baseline, vídeos.

## Complexity Tracking

| Ponto                                        | Por que é necessário                                                          | Alternativa mais simples rejeitada                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| BVH de dois níveis na GPU                    | Geometria viva escrita na GPU e instâncias que se movem; sem leitura de volta | BVH na CPU (leitura de volta proibida); SDF/voxels (vazamento em paredes finas) |
| Sondas + fótons (dois sentidos)              | Difuso estável e barato pelas sondas; cáusticas só por fótons                 | Só fótons (ruído, custo); ReSTIR na tela (instável sem TAA)                     |
| Composição das funções `material` em compute | O rebatimento usa o mesmo material do desenho                                 | Tabela de constantes (cor errada nos materiais por nós)                         |
| Atmosfera de Hillaire                        | Cor física do sol e do céu com a altura e a altitude                          | Ajustes analíticos (sem o sol no horizonte, sem altitude)                       |
| Traçador de caminhos na CPU                  | Medida contra a referência física (SC-001)                                    | Comparação visual (não mede)                                                    |
