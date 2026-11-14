# Implementation Plan: Refração física e qualidade de imagem (a 034 refeita)

**Branch**: `feature/034-refracao-fisica` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/034-refracao-fisica/spec.md` · Pesquisa: [research.md](./research.md) ·
Base: a 033 (estrutura de raios, GI, céu, campo da água, névoa) e a 011 (fechamento, apresentação HDR)

## Summary

1. **Prontidão e medida (C2/C1)**: `EngineReadiness` com eventos e `whenReady` com prazo; `catch` nas compilações;
   aviso de consumidor ausente (H2); profiler em anel com uma leitura por quadro (H1) (R5, R7).
2. **Material nos acertos comum (C3)**: a composição sai da GI para a estrutura de raios; footprint por cone de raio
   nos acertos e por derivadas no raster; nós da biblioteca filtrados (H6) (R2).
3. **Antisserrilhado temporal (C3/C4)**: jitter na câmera e em todos os raios por pixel, matrizes e transformações
   anteriores, vértices anteriores, alvo de movimento, resolve com rejeição e máscara reativa, apresentação no resolve
   (G2) (R3).
4. **Refração (C3/C4)**: `Refraction` + `RefractionFlow` em frente de onda, pilha de meios, Fresnel exato, GGX VNDF,
   dispersão por canal, Beer–Lambert, reflexão interna total; o forward e a água leem a saída por pixel, sem cópia da
   tela (R1, R11).
5. **Luz global e névoa (C3)**: coleta de tela convergente, rebatimentos pelas sondas do mundo, quinas, L2–L9, ambiente
   da névoa (R4).
6. **Sombra (C3)**: caixa ajustada à vista, PCF rotacionado, PCSS, bias do plano receptor (R6).
7. **Água da 011 US4 (C3/C4)**: composição pelo traçado, obsolescências, cáusticas físicas por medida (R11).
8. **Smokes herdados e pendências**: as seis checagens (R9), H3/G3, custo do HDR, docs, reconciliação das caixas.
9. **Vídeo (ferramenta)**: captura do quadro apresentado direto da GPU, ffmpeg por `stdin` (R8).
10. **Verificação**: traçador da CPU com dielétrico e pilha de meios (R10); smokes `refraction`, `antialiasing`,
    `giNoise`, `readiness`; teste de limites; bench; vídeos.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem dependências novas de runtime; `ffmpeg` no PATH só para a ferramenta de vídeo

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`, baselines em `bench/baselines/`)

**Testing**: Vitest 4 (`countingCore`): `EngineReadiness` (estados, prazo, falha de compilação, consumidor ausente),
profiler (anel, uma entrega por quadro), jitter e matrizes anteriores (`CameraFlow`), `worldsPrevious` (slots sujos),
composição do material nos acertos (símbolo único), contagem de ligações de todos os pipelines (≤ 10), referência da
CPU (dielétrico, pilha de meios, casos analíticos), footprint dos nós contra a referência; smokes de navegador (fonte e
`--dist`): `readiness`, `refraction`, `antialiasing`, `giNoise`, `globalIllumination`, `fog`, `fluidSurface`,
`materials` e todos os existentes; `bench:check`; `npm run ci`

**Target Platform**: Chrome/Edge com WebGPU; piso Apple M4 (`apple-metal-3`), validação também na RTX 4090
(`nvidia-lovelace`) pela outra máquina

**Project Type**: biblioteca (engine)

**Performance Goals** (M4, 1280×720; fração do quadro de 60 Hz): antisserrilhado ≤ 1,5 ms (9 %); refração na cena da
lente ≤ 3 ms (18 %); GI corrigida ≤ 3,67 ms × 1,10; nenhuma cena do bench regride > 10 % de GPU; `instances/100k`,
`10k-functions` e GI desligada nos valores do baseline

**Constraints**: Resource + evento + Flow, sem helpers; dispatch só grava; nenhuma leitura de volta por quadro no
motor; trajetórias bit a bit; cada símbolo WGSL uma vez; C3/C4 só pela C2 (com `scene/graph` na lista); ≤ 10 storage
por estágio; água e vidro só por física e raio traçado; sem cópia da tela

**Scale/Scope**: C1 (profiler; usage `COPY_SRC` opcional do canvas); C2 (`EngineReadiness`, `catch`, H2, contratos);
C3 (estrutura de raios, `Refraction`, câmera, transformações, GI, névoa, sombra, nós, material); C4 (`Application`,
`TemporalAntialiasing`, resolve, forward, água, pós); smokes; bench; ferramenta de vídeo; docs

## Constitution Check

| Princípio                       | Avaliação                                                                                                                                                                            | Status |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **I. Camadas e importação**     | Prontidão na C2; refração, câmera, GI e sombra na C3; resolve e água na C4; a refração consome a estrutura de raios e a luz só por contratos; `scene/graph` entra na lista e no lint | ✅     |
| **II. Domínio na borda**        | Autoria por `antialias`, `ior`, `abbe`, `roughness`, `whenReady`; fila, pilha e jitter são internos                                                                                  | ✅     |
| **III. Resource como contrato** | `EngineReadiness`, `Refraction`, `TemporalAntialiasing`, alvos de movimento e histórico declarados por descritor                                                                     | ✅     |
| **IV. ECS e Flows**             | `RefractionFlow`, `TemporalResolveFlow`, passe de resposta das sondas como Flows com dependências declaradas; prontidão por evento                                                   | ✅     |
| **V. Testes**                   | CPU para estados, layouts, matrizes, ligações e referências; GPU por smokes com medidas (fonte e `--dist`)                                                                           | ✅     |
| **VI. Documentação**            | Guias de refração, antisserrilhado, prontidão, vídeo; os da 011 (T104–T108); arquitetura (ordem dos passes); ROADMAP; PENDENCIAS reescrito                                           | ✅     |
| **Restrições técnicas**         | Sem deps; `refraction` da água e o caminho da cópia da tela saem com aviso de obsolescência; `antialias: boolean` aceito como sinônimo (true → temporal)                             | ✅     |
| **Quality gates**               | `npm run ci` + smokes (fonte e `--dist`, 3 rodadas) + `bench:check` + teste de limites                                                                                               | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/refraction-antialiasing.md) mantém materiais e nós; a
refração lê o `Closure` devolvido; a prontidão é aditiva; `antialias` booleano continua aceito.

## Project Structure

### Documentation (this feature)

```text
specs/034-refracao-fisica/
├── plan.md
├── research.md          # Achados A–D e decisões R1–R12
├── data-model.md
├── quickstart.md
├── contracts/refraction-antialiasing.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/core/gpu/profiler/GpuProfilerSystem.ts                         # anel de leituras (R7)
src/scene/systems/flowBinding/PipelineState.ts, FlowRuntime.ts     # catch, prontidão, consumerMissing (R5)
src/scene/readiness/EngineReadiness.ts (NOVO); scene/events/EventMap.ts
src/elements/raytrace/hitMaterial.ts (NOVO), shaders.ts, RaySceneFlow.ts   # material e footprint nos acertos (R2)
src/elements/lighting/refraction/Refraction.ts, RefractionFlow.ts (NOVOS)  # (R1)
src/elements/gpu/wgsl/refraction/*.wgsl (NOVOS)                            # fila, pilha, interface, traçado
src/elements/lighting/denoise/TracedDenoiser.ts, shaders.ts; gpu/wgsl/denoise/*.wgsl (NOVOS)  # filtro do sinal traçado (R3a, em avaliação)
src/presentation/flows/RefractionCompositeFlow.ts, RefractionDenoiseFlow.ts, RefractionMotionFlow.ts (NOVOS)  # composição, filtro, movimento
src/elements/scene/Camera.ts, flows/CameraFlow.ts, gpu/wgsl/kernels/camera_compose*.wgsl  # jitter, anteriores (R3)
src/elements/scene/Transform.ts, flows/TransformFlow.ts             # worldsPrevious
src/elements/geometry/SurfaceFlow.ts, physics/flows/SoftSurfaceFlow.ts, scene/graph/GraphFlow.ts  # vértices anteriores
src/elements/lighting/ProbeFlow.ts, gpu/wgsl/gi/*.wgsl              # (R4)
src/elements/media/FroxelFlow.ts, gpu/wgsl/media/*.wgsl             # ambiente e histórico da névoa
src/elements/scene/ShadowMap.ts, gpu/wgsl/kernels/shadow_matrix.wgsl, math/brdf.wgsl  # (R6)
src/elements/gpu/wgsl/nodes/*.wgsl, nodes/**                        # footprint nos nós (H6)
src/elements/lighting/reference/pathTracer.ts                       # dielétrico e pilha de meios (R10)
src/presentation/resources/TemporalAntialiasing.ts (NOVO); flows/TemporalResolveFlow.ts (NOVO)
src/presentation/flows/ForwardFlow.ts, forward_transmission.wgsl, PostFlow.ts, defaults.ts, app/FrameTargets.ts
src/presentation/water/**, flows/WaterFlow.ts, elements/material/FluidSurfaceMaterial*.ts  # (R11)
src/presentation/app/Application.ts                                 # whenReady, antialias
eslint.config.js, constitution (lista de contratos)                 # scene/graph
src/__smokes__/readiness.ts, refraction.ts, antialiasing.ts, giNoise.ts (NOVOS); support/capture.ts (NOVO)
bench/runner/video.ts (NOVO)
clay-engine-doc/docs/guides/*, specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; a prontidão é genérica (C2); a refração e a luz na C3 (elementos), o resolve
temporal e a composição na C4; a ferramenta de vídeo fica no `bench/runner` e no suporte dos smokes, fora do pacote.

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: estado de partida medido (ci, smokes fonte/`--dist`, bench, a medida das manchas como smoke `giNoise`
   vermelho); teste de limites de ligações.
2. **Fundação — prontidão e medida (US4, parte da US5)**: `EngineReadiness`, `whenReady`, `catch`, H2; profiler em
   anel; smokes passam a esperar a prontidão e deduplicar por `gpuFrame`.
3. **Fundação — material nos acertos e footprint (R2)**: módulo comum, GI migrada sem mudança de imagem (bit a bit
   nos smokes da 033), cone de raio, nós filtrados.
4. **Ferramenta de vídeo (US6)**: cedo, para validar visualmente as fases seguintes.
5. **US2 antisserrilhado**: jitter, anteriores, movimento, resolve, reativo, G2; smoke `antialiasing`.
6. **US1 refração**: referência da CPU, fila, traçado, pilha, dispersão, composição do forward; smoke `refraction`.
7. **US3 luz global e névoa**: R4 por item, cada um medido no `giNoise`; cáusticas; névoa.
8. **US7 sombra e regressões**: R6; fixtures por perfil; teste da vizinhança se H3 pedir.
9. **US8 água e pendências**: água pelo traçado (R11), cáusticas por medida; H3/G3; custo do HDR; R9 (as seis
   checagens).
10. **Docs**: guias novos e os da 011, arquitetura, ROADMAP, PENDENCIAS reescrito, reconciliação das caixas 001–033.
11. **Fechamento**: smokes 3× (fonte e `--dist`), `bench:check` e baseline, `npm run ci`, vídeos pela ferramenta nova.

## Complexity Tracking

| Ponto                              | Por que é necessário                                                               | Alternativa mais simples rejeitada                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Frente de onda com fila de pixels  | Só pixels transmissivos pagam o traçado; divergência controlada; cabe no orçamento | Traçar no fragmento (sem ligações de storage suficientes, divergência)            |
| Pilha de meios em registradores    | Vidro dentro d'água e água em copo exigem o par de índices certo                   | Alternar dentro/fora (erro provado na tentativa da 4090)                          |
| Vértices anteriores em anel        | Movimento correto da geometria deformada (superfícies, tecido, grafos)             | Só movimento de câmera e de transformações (rastro nas superfícies animadas)      |
| Footprint por cone de raio         | Filtrar texturas e padrões nos acertos (H6) e AA especular nos raios               | Constantes nos acertos (H6 fica aberta; serrilhado através do vidro)              |
| Rebatimentos pelas sondas do mundo | Corta a realimentação que espalha o erro de uma sonda                              | Filtrar mais forte (empurra o erro para a baixa frequência — a causa das manchas) |
