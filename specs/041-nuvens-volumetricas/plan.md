# Implementation Plan: Nuvens volumétricas

**Branch**: `feature/041-nuvens-volumetricas` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/041-nuvens-volumetricas/spec.md` · Pesquisa: [research.md](./research.md) ·
Base: a 033 (céu físico, névoa, GI), a 034 (refração, reconstrução por blocos com gradiente temporal, mapa de sombra
virtual) e a 037 (canal temporal)

## Summary

1. **Ruído ladrilhável (C3, nós)**: parâmetro `period` nos nós de ruído (Perlin, fBm, celular), com a referência u32
   bit a bit estendida (R3).
2. **Céu (C3)**: volume de perspectiva aérea 32³ no `Sky`/`SkyFlow` (Hillaire 2020) e o ponto novo `sky_cover`,
   lido pela contribuição do céu a `scene_environment` (R10, R12).
3. **Camada de nuvens (C3)**: `CloudLayer` (Resource), as funções `CloudShapeFunction` (ponto `cloud_shape`) e
   `CloudCoverageFunction` (ponto `cloud_coverage`), o `CloudNoiseFlow` (volumes de forma e detalhe, só quando mudam) e
   o `CloudFlow` (cobertura, irradiâncias, mapa de transmitância visto do sol, marcha principal, reconstrução temporal,
   panorama) (R1–R9, R11, R12).
4. **Contribuições (C3)**: `light_transmission` pela sombra das nuvens (só a luz do sol do `Sky`) e `sky_cover` pelo
   panorama (R11, R12).
5. **Composição (C4)**: `CloudCompositeFlow` sobre a cor e a profundidade da cena, atrás da névoa (R13).
6. **Perfis e limites**: `RENDER_PROFILES.clouds`; nenhuma ligação de storage a mais nos estágios da luz (R15).
7. **Verificação**: referência f64 (`cloudModel.ts` e o traçador com rastreamento delta), calibração das oitavas, smoke
   `clouds`, bench `clouds/*`, vídeos no claflow-web (R16, R17).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; nenhuma dependência nova de runtime

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`, baselines em `bench/baselines/`)

**Testing**: Vitest 4 — referência u32 dos ruídos com `period` (bit a bit e periodicidade exata), perfil de altura,
fase de J&dE (normalização, valores do artigo), aproximação por oitavas contra o traçador (erro registrado), mapa de
transmitância (`T(p)` contra a integral), reprojeção pelo vento, empacotamento do `CloudLayer`, contagem de ligações
por estágio (≤ 10 storage), contribuições compostas (`sky_cover`, `light_transmission`); smokes de navegador (fonte e
`--dist`): `clouds` (novo) e todos os existentes; `bench:check` com as cenas `clouds/*`; `npm run ci`

**Target Platform**: Chrome/Edge com WebGPU; piso Apple M4 (`apple-metal-3`); nada específico de fabricante

**Project Type**: biblioteca (engine) + cenas no app `claflow-web`

**Performance Goals** (M4, 1280 × 720): nuvens ≤ 3 ms no alto (18 % do quadro de 60 Hz), ≤ 2 ms no médio, ≤ 1,2 ms no
baixo; cena sem camada: zero; com a camada e sem céu visível: ≤ 0,3 ms; nenhuma cena do bench regride > 10 % de GPU

**Constraints**: Resource + evento + Flow, sem helpers, sem `core.create` em Flow; nada na CPU (os volumes e mapas são
escritos por kernel); estado entre quadros só pelo canal 037; laços de GPU com teto constante; produção não importa
`reference/`; ≤ 10 buffers de storage por estágio (nenhum a mais no forward, na refração e na GI); cada símbolo WGSL
uma vez; AAA sem falsear (nenhuma imagem de nuvem)

**Scale/Scope**: C3 (nós de ruído, céu, mídia/nuvens, pontos, perfis); C4 (composição, estágios padrão); referência;
smoke; bench; cenas e vídeos no claflow-web; docs

## Constitution Check

| Princípio                       | Avaliação                                                                                                                                                                                                               | Status |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | `CloudLayer`, funções, Flows de cálculo e contribuições na C3; `CloudCompositeFlow` na C4; tudo pelos contratos da C2 (`scene/contracts`, `scene/flows`, `scene/shaders`, `scene/graph`); nenhuma importação de `core/` | ✅     |
| **II. Domínio na borda**        | Autoria por `base`, `top`, `coverage`, `type`, `density`, `wind`, `dropletDiameter`, `albedo`; volumes, mapas e passos são internos                                                                                     | ✅     |
| **III. Resource como contrato** | `CloudLayer` declara os alvos (volumes, cobertura, sombra, panorama, marcha, histórico) por descritor, `allocation: 'onDemand'`; parâmetros por `Schema`                                                                | ✅     |
| **IV. ECS e Flows**             | `CloudNoiseFlow`, `CloudFlow`, `CloudCompositeFlow` com fase e prioridade declaradas; recálculo dos volumes pela revisão do recurso (evento de mudança de slot), não por chamada                                        | ✅     |
| **V. Testes**                   | Referência f64 com testes AAA para cada função nova; smoke `clouds` contra o traçador; limites medidos                                                                                                                  | ✅     |
| **VI. Documentação**            | Guia "Nuvens volumétricas", JSDoc em todos os exports, ROADMAP e PENDENCIAS                                                                                                                                             | ✅     |
| **VII. Série temporal**         | Marcha, profundidade da nuvem, sombra e panorama são séries da 037; o deslocamento do vento é função do relógio simulado (não estado); nenhum pingue-pongue privado                                                     | ✅     |
| **Restrições técnicas**         | Sem dependências; API só aditiva (`CloudLayer`, opção `period` nos ruídos, ponto `sky_cover`)                                                                                                                           | ✅     |
| **Quality gates**               | `npm run ci` + smokes (fonte e `--dist`, 3 rodadas) + `bench:check`                                                                                                                                                     | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/clouds.md) é aditivo; o `Sky` sem `CloudLayer` gera o
mesmo WGSL de hoje (o ponto `sky_cover` sem contribuinte devolve `(0, 0, 0, 1)` e não entra no módulo); nenhum
consumidor existente de `scene_environment` ou `light_transmission` muda.

## Project Structure

### Documentation (this feature)

```text
specs/041-nuvens-volumetricas/
├── plan.md
├── research.md          # levantamento e decisões R1–R17
├── data-model.md
├── quickstart.md
├── contracts/clouds.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/elements/gpu/wgsl/math/noise.wgsl; nodes/noise/index.ts; nodes/reference/noise.ts   # period (R3)
src/elements/scene/sky/Sky.ts, SkyFlow.ts, points.ts, shaders.ts                        # perspectiva aérea, sky_cover (R10, R12)
src/elements/gpu/wgsl/sky/sky_aerial.wgsl (NOVO)
src/elements/scene/points/lighting.ts                                                   # ponto sky_cover (composição "na frente de")
src/elements/media/clouds/CloudLayer.ts (NOVO)                                          # Resource
src/elements/media/clouds/schemas.ts, shaders.ts, points.ts (NOVOS)                     # uniforme, módulos, contribuições
src/elements/media/clouds/CloudNoiseFlow.ts (NOVO)                                      # volumes de forma e detalhe
src/elements/media/clouds/CloudFlow.ts (NOVO)                                           # cobertura, irradiâncias, sombra, marcha, reconstrução, panorama
src/elements/extension/CloudShapeFunction.ts, CloudCoverageFunction.ts (NOVOS)          # pontos cloud_shape, cloud_coverage
src/elements/gpu/wgsl/clouds/*.wgsl (NOVOS)                                             # cloud_common, cloud_density, cloud_phase, cloud_light,
                                                                                        # cloud_noise, cloud_coverage, cloud_ambient, cloud_shadow,
                                                                                        # cloud_march, cloud_reconstruct, cloud_upsample, cloud_panorama
src/elements/media/clouds/reference/cloudModel.ts (NOVO) + __tests__                    # espelho f64 (R16)
src/elements/lighting/reference/pathTracer.ts                                           # fase arbitrária, rastreamento delta (R16)
src/elements/render/Renderer.ts                                                         # RENDER_PROFILES.clouds (R15)
src/presentation/flows/CloudCompositeFlow.ts (NOVO), cloud_composite.wgsl (NOVO)        # composição (R13)
src/presentation/flows/defaults.ts                                                      # registro dos Flows, fases e prioridades
src/__smokes__/clouds.ts (NOVO), support/cloudScenes.ts (NOVO)                          # smoke pelo caminho de autoria
bench/scenes/clouds/ (NOVO)                                                             # céu ao meio dia, pôr do sol, voo
claflow-web/src/scenes/catalog.ts                                                       # nuvens, pordosol, voo, sombrasnuvens
clay-engine-doc/docs/guides/clouds.md (NOVO); specs/ROADMAP.md; specs/PENDENCIAS.md
```

**Structure Decision**: as nuvens são um meio participante: ficam em `elements/media/clouds`, ao lado da névoa, com os
WGSL em `gpu/wgsl/clouds`. O céu ganha só a perspectiva aérea e o ponto `sky_cover`. A composição é da C4, como a da
refração.

### Ordem dos estágios (fase e prioridade)

| Estágio                                                 | Fase        | Depois de                                                           | Antes de                                                   |
| ------------------------------------------------------- | ----------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `CloudNoiseFlow`                                        | `transform` | `SkyFlow`                                                           | a GI                                                       |
| `CloudFlow` (cobertura, irradiâncias, sombra, panorama) | `shadow`    | `SkyFlow`, `ShadowFlow`                                             | `ProbeFlow`, `FroxelFlow` (que leem a sombra e o ambiente) |
| `CloudFlow` (marcha, reconstrução)                      | `forward`   | `ForwardFlow` e `RefractionCompositeFlow` (precisa da profundidade) | `CloudCompositeFlow`                                       |
| `CloudCompositeFlow`                                    | `forward`   | `CloudFlow`                                                         | a água, os sprites, a resolução temporal                   |

O `CloudFlow` é um Flow com duas partes de trabalho (`FlowWork`), uma em cada fase.

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: estado de partida medido (ci, smokes, bench) e a contagem de ligações por estágio dos pipelines que leem a
   luz (forward, injeção dos froxels, traçado da GI, `refraction_path`), registrada para comparar depois.
2. **Referência primeiro**: ruído com `period` (u32), perfil de altura, fase de J&dE, densidade, mapa de transmitância,
   oitavas; o traçador com rastreamento delta e fase arbitrária; a cena de validação e as imagens de referência (R16).
3. **Fundação — ruído ladrilhável e céu**: `period` nos nós (GPU bit a bit contra a referência); perspectiva aérea e
   `sky_cover` no céu, sem mudar a imagem de nenhuma cena existente (smokes `sky`, `fog`, `globalIllumination` iguais).
4. **US1 — céu com nuvens**: `CloudLayer`, volumes, marcha, reconstrução, composição; smoke `clouds` (transmitância,
   radiância, brilho de borda, transição da câmera pela camada); vídeo do céu ao meio dia e do pôr do sol.
5. **US2 — forma e tipo**: cobertura e mapa de tempo, perfil por tipo, vento sem salto, funções `cloud_shape` e
   `cloud_coverage` por grafo; casos de cobertura 0/1, mapa com região vazia e vento medido por correlação.
6. **US3 — luz e sombra na cena**: mapa de transmitância e o contribuinte de `light_transmission`, irradiâncias,
   panorama e `sky_cover` (GI, refração, reflexo na água), composição com a névoa; casos da sombra no chão, do
   encoberto e do reflexo.
7. **US4 — tempo real**: perfis, medida por passe no bench, cintilação e rastro no smoke de antisserrilhado com nuvens,
   `deviceFloor` com nuvens, interior sem céu.
8. **Docs e cenas**: guia, JSDoc, ROADMAP, PENDENCIAS; cenas e vídeos no claflow-web.
9. **Fechamento**: smokes 3× (fonte e `--dist`), `bench:check`, `npm run ci`, vídeos enviados.

## Riscos

| #   | Risco                                                                                                                                                                             | Mitigação                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Limite de 10 buffers de storage por estágio** (M4): o contribuinte de `light_transmission` entra em todo pipeline que lê a luz, inclusive o `refraction_path`, já perto do teto | Tudo das nuvens que outros estágios leem é textura amostrada + um uniforme (R15). A contagem por estágio é medida na Fase 1 e depois de cada contribuição; se o limite de texturas amostradas (16) apertar, os dados da sombra e do panorama vão para as camadas de uma textura só. |
| 2   | A aproximação por oitavas não chegar a 5 % do traçador em toda região (SC-001)                                                                                                    | Calibrar a, b, c contra o traçador na Fase 2; se a borda fina não fechar, o erro é medido por região e o critério é ajustado com racional escrito (memória "princípio dos limiares"), sem falsear a imagem.                                                                         |
| 3   | Rastro ou sal e pimenta na reconstrução com vento forte e câmera rápida (a lição dos blocos 2 × 2 da 034)                                                                         | Reprojeção pela profundidade da nuvem e pelo vento, gradiente temporal da 034, smoke de antisserrilhado com nuvens e vento.                                                                                                                                                         |
| 4   | Orçamento de 3 ms estourar no M4                                                                                                                                                  | Medida por passe desde a primeira marcha; tetos por perfil; a marcha em duas velocidades e a saída antecipada; o panorama e a sombra fatiados.                                                                                                                                      |
| 5   | Névoa e nuvem sobrepostas (câmera dentro da nuvem com névoa local) violam a ordem "névoa na frente" da composição (R13)                                                           | Caso coberto no smoke; erro medido; se relevante, a marcha da nuvem lê a transmitância dos froxels no ponto (eles já estão ligados no estágio).                                                                                                                                     |
| 6   | A perspectiva aérea só nas nuvens deixa a montanha distante sem a atmosfera, contrastando com a nuvem atrás dela                                                                  | Registrado como pendência: estender a perspectiva aérea à geometria muda as referências de todas as cenas ao ar livre e merece decisão própria.                                                                                                                                     |
| 7   | Precisão do deslocamento do vento em sessões longas                                                                                                                               | Redução módulo o período em f64 no empacotamento (R6); teste de 24 h simuladas.                                                                                                                                                                                                     |

## Complexity Tracking

| Ponto                              | Por que é necessário                                                            | Alternativa mais simples rejeitada                                              |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Ponto novo `sky_cover`             | A nuvem tapa o céu (composição), e `scene_environment` só soma                  | Somar a diferença no `scene_environment` (acopla a nuvem à fórmula do céu)      |
| Perspectiva aérea no céu           | FR-012: a nuvem distante esmaecida e azulada                                    | Ignorar (nuvens distantes brancas demais)                                       |
| Mapa de transmitância visto do sol | A sombra parcial em todos os receptores por um ponto só                         | Marchar até o sol em cada receptor (caro, repetido em vários estágios)          |
| Panorama das nuvens                | Os raios que escapam (GI, refração, reflexo) veem as nuvens sem marchar cada um | Marchar por raio (milhares de raios das sondas)                                 |
| Rastreamento delta no traçador     | Verdade para calibrar o múltiplo espalhamento em meios de quilômetros           | Marcha de 512 passos do traçador atual (viés e custo em meios densos e grandes) |
