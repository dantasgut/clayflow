# Implementation Plan: Nuvens volumétricas

**Branch**: `feature/041-nuvens-volumetricas` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/041-nuvens-volumetricas/spec.md` · Pesquisa: [research.md](./research.md) ·
Base: a 033 (céu físico, névoa, GI), a 034 (refração, reconstrução por blocos com gradiente temporal, mapa de sombra
virtual) e a 037 (canal temporal)

## Summary

1. **Ruído ladrilhável (C3, nós)**: parâmetro `period` nos nós de ruído (Perlin, fBm, celular), com a referência u32
   bit a bit estendida (R3).
2. **Céu (C3)**: volume de perspectiva aérea 32³ no `Sky`/`SkyFlow` (Hillaire 2020), aplicado a toda a geometria da
   cena e às nuvens (FR-022), e o ponto novo `sky_cover`, lido pela contribuição do céu a `scene_environment` (R10, R12).
3. **Camada de nuvens (C3)**: `CloudLayer` (Resource), as funções `CloudShapeFunction` (ponto `cloud_shape`) e
   `CloudCoverageFunction` (ponto `cloud_coverage`), o `CloudNoiseFlow` (volumes de forma e detalhe, só quando mudam) e
   o `CloudFlow` (cobertura, irradiâncias, mapa de transmitância visto do sol, marcha principal, reconstrução temporal,
   panorama) (R1–R9, R11, R12).
4. **Contribuições (C3)**: `light_transmission` pela sombra das nuvens (só a luz do sol do `Sky`) e `sky_cover` pelo
   panorama (R11, R12).
5. **Composição (C4)**: `SkyCompositeFlow` sobre a cor e a profundidade da cena, atrás da névoa: a perspectiva aérea em
   toda cena com `Sky` e as nuvens quando há `CloudLayer` (R13).
6. **Perfis e limites**: `RENDER_PROFILES.clouds`; a contagem de ligações por estágio registrada antes e depois e verificada contra os limites do adaptador (R15).
7. **Verificação**: referência f64 (`cloudModel.ts` e o traçador com rastreamento delta), calibração das oitavas, smoke
   `clouds`, bench `clouds/*`, vídeos no claflow-web (R16, R17).
8. **O tempo (C3; US5, R19)**: `CloudLayer.weather` e a `CloudPressureFunction` (ponto `cloud_pressure`, o padrão de
   sistemas sem ela); no `CloudLightFlow`, o kernel do tempo (estêncil da pressão, vento gradiente com atrito, Ekman,
   Okubo–Weiss, o estado pela série 037 trazido pelo vento e relaxado) antes do mapa de cobertura, que passa a ser escrito
   pelo estado com o topo local no canal A; a densidade com o topo local e a bigorna; a reconstrução pelo vento do tempo
   (lugar `cloud_wind_at`). Referência `reference/cloudWeather.ts`; casos `pressure-wind`, `storm`, `front`,
   `weather-timing`; a cena `tempestade`.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; nenhuma dependência nova de runtime

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`, baselines em `bench/baselines/`)

**Testing**: Vitest 4 — referência u32 dos ruídos com `period` (bit a bit e periodicidade exata), perfil de altura,
fase de J&dE (normalização, valores do artigo), aproximação por oitavas contra o traçador (erro registrado), mapa de
transmitância (`T(p)` contra a integral), reprojeção pelo vento, empacotamento do `CloudLayer`, contagem de ligações
por estágio (registrada e verificada contra os limites do adaptador), contribuições compostas (`sky_cover`, `light_transmission`); smokes de navegador (fonte e
`--dist`): `clouds` (novo) e todos os existentes; `bench:check` com as cenas `clouds/*`; `npm run ci`

**Target Platform**: Chrome/Edge com WebGPU; piso Apple M4 (`apple-metal-3`); nada específico de fabricante

**Project Type**: biblioteca (engine) + cenas no app `claflow-web`

**Performance Goals** (M4, 1280 × 720): nuvens ≤ 3 ms no alto (18 % do quadro de 60 Hz), ≤ 2 ms no médio, ≤ 1,2 ms no
baixo; cena sem camada: zero; com a camada e sem céu visível: ≤ 0,3 ms; só o céu (a perspectiva aérea na geometria): ≤ 0,25 ms; nenhuma cena do bench regride > 10 % de GPU

**Constraints**: Resource + evento + Flow, sem helpers, sem `core.create` em Flow; nada na CPU (os volumes e mapas são
escritos por kernel); estado entre quadros só pelo canal 037; laços de GPU com teto constante; produção não importa
`reference/`; os limites de ligação são os do adaptador (`PlatformAdapter.limitsCap`), verificados pela composição real; cada símbolo WGSL
uma vez; AAA sem falsear (nenhuma imagem de nuvem)

**Scale/Scope**: C3 (nós de ruído, céu, mídia/nuvens, pontos, perfis); C4 (composição, estágios padrão); referência;
smoke; bench; cenas e vídeos no claflow-web; docs

## Constitution Check

| Princípio                       | Avaliação                                                                                                                                                                                                             | Status |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | `CloudLayer`, funções, Flows de cálculo e contribuições na C3; `SkyCompositeFlow` na C4; tudo pelos contratos da C2 (`scene/contracts`, `scene/flows`, `scene/shaders`, `scene/graph`); nenhuma importação de `core/` | ✅     |
| **II. Domínio na borda**        | Autoria por `base`, `top`, `coverage`, `type`, `density`, `wind`, `dropletDiameter`, `albedo`; volumes, mapas e passos são internos                                                                                   | ✅     |
| **III. Resource como contrato** | `CloudLayer` declara os alvos (volumes, cobertura, sombra, panorama, marcha, histórico) por descritor, `allocation: 'onDemand'`; parâmetros por `Schema`                                                              | ✅     |
| **IV. ECS e Flows**             | `CloudNoiseFlow`, `CloudFlow`, `SkyCompositeFlow` com fase e prioridade declaradas; recálculo dos volumes pela revisão do recurso (evento de mudança de slot), não por chamada                                        | ✅     |
| **V. Testes**                   | Referência f64 com testes AAA para cada função nova; smoke `clouds` contra o traçador; limites medidos                                                                                                                | ✅     |
| **VI. Documentação**            | Guia "Nuvens volumétricas", JSDoc em todos os exports, ROADMAP e PENDENCIAS                                                                                                                                           | ✅     |
| **VII. Série temporal**         | Marcha, profundidade da nuvem, sombra e panorama são séries da 037; o deslocamento do vento é função do relógio simulado (não estado); nenhum pingue-pongue privado; o estado do tempo (R19) é série da 037, com o centro do quadrado recalculado no shader pela vista anterior | ✅     |
| **Restrições técnicas**         | Sem dependências; API só aditiva (`CloudLayer`, opção `period` nos ruídos, ponto `sky_cover`)                                                                                                                         | ✅     |
| **Quality gates**               | `npm run ci` + smokes (fonte e `--dist`, 3 rodadas) + `bench:check`                                                                                                                                                   | ✅     |

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
src/elements/media/clouds/reference/cloudWeather.ts (NOVO) + __tests__                  # o tempo em f64 (R19)
src/elements/extension/CloudPressureFunction.ts (NOVO)                                  # ponto cloud_pressure (R19)
src/elements/gpu/wgsl/clouds/cloud_weather*.wgsl, cloud_pressure_default.wgsl,          # o tempo (R19)
  cloud_coverage_weather.wgsl, cloud_wind_weather.wgsl (NOVOS)
src/elements/lighting/reference/pathTracer.ts                                           # fase arbitrária, rastreamento delta (R16)
src/elements/render/Renderer.ts                                                         # RENDER_PROFILES.clouds (R15)
src/presentation/flows/SkyCompositeFlow.ts (NOVO), sky_composite.wgsl (NOVO)            # perspectiva aérea + nuvens (R10, R13)
src/presentation/flows/defaults.ts                                                      # registro dos Flows, fases e prioridades
src/__smokes__/clouds.ts (NOVO), support/cloudScenes.ts (NOVO)                          # smoke pelo caminho de autoria
bench/scenes/clouds/ (NOVO)                                                             # céu ao meio dia, pôr do sol, voo
claflow-web/src/scenes/catalog.ts                                                       # nuvens, pordosol, voo, sombrasnuvens
clay-engine-doc/docs/guides/clouds.md (NOVO); specs/ROADMAP.md; specs/PENDENCIAS.md
```

**Structure Decision**: as nuvens são um meio participante: ficam em `elements/media/clouds`, ao lado da névoa, com os
WGSL em `gpu/wgsl/clouds`. O céu ganha a perspectiva aérea (para toda a geometria) e o ponto `sky_cover`. A composição é da C4, como a da
refração.

### Ordem dos estágios (fase e prioridade)

| Estágio                                                 | Fase        | Depois de                                             | Antes de                                                   |
| ------------------------------------------------------- | ----------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `CloudNoiseFlow`                                        | `transform` | `SkyFlow`                                             | a GI                                                       |
| `CloudFlow` (cobertura, irradiâncias, sombra, panorama) | `shadow`    | `SkyFlow`, `ShadowFlow`                               | `ProbeFlow`, `FroxelFlow` (que leem a sombra e o ambiente) |
| `CloudLightFlow.weather` (o estado do tempo, R19)       | `shadow`    | o uniforme do quadro (`CloudNoiseFlow`)               | o mapa de cobertura (mesmo Flow, despachado antes)         |
| `CloudFlow` (marcha, reconstrução)                      | `forward`   | a água (a última superfície que escreve profundidade) | `SkyCompositeFlow`                                         |
| `SkyCompositeFlow` (com `Sky`, com ou sem nuvens)       | `forward`   | `CloudFlow`, a água                                   | a resolução temporal                                       |

O `CloudFlow` é um Flow com duas partes de trabalho (`FlowWork`), uma em cada fase.

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: estado de partida medido (ci, smokes, bench) e a contagem de ligações por estágio dos pipelines que leem a
   luz (forward, injeção dos froxels, traçado da GI, `refraction_path`), registrada para comparar depois.
2. **Referência primeiro**: ruído com `period` (u32), perfil de altura, fase de J&dE, densidade, mapa de transmitância,
   oitavas; o traçador com rastreamento delta e fase arbitrária; a cena de validação e as imagens de referência (R16).
3. **Fundação — ruído ladrilhável e céu**: `period` nos nós (GPU bit a bit contra a referência); `sky_cover` no céu sem
   mudar a imagem de nenhuma cena (smokes `sky`, `fog`, `globalIllumination` iguais).
4. **Perspectiva aérea em toda a geometria (FR-022)**: a tabela 32³ no `SkyFlow` e o `SkyCompositeFlow` (só a
   atmosfera, ainda sem nuvens); referência da atmosfera até superfícies a 2, 10 e 30 km (SC-009); as fixtures das cenas
   com `Sky` regravadas com a montagem antes/depois e relatadas; o baseline do bench das cenas com `Sky` (`global-illumination`)
   regravado com o custo medido.
5. **US1 — céu com nuvens**: `CloudLayer`, volumes, marcha, reconstrução, composição; smoke `clouds` (transmitância,
   radiância, brilho de borda, transição da câmera pela camada); vídeo do céu ao meio dia e do pôr do sol.
6. **US2 — forma e tipo**: cobertura e mapa de tempo, perfil por tipo, vento sem salto, funções `cloud_shape` e
   `cloud_coverage` por grafo; casos de cobertura 0/1, mapa com região vazia e vento medido por correlação.
7. **US3 — luz e sombra na cena**: mapa de transmitância e o contribuinte de `light_transmission`, irradiâncias,
   panorama e `sky_cover` (GI, refração, reflexo na água), composição com a névoa; casos da sombra no chão, do
   encoberto e do reflexo.
8. **US4 — tempo real**: perfis, medida por passe no bench, cintilação e rastro no smoke de antisserrilhado com nuvens,
   `deviceFloor` com nuvens, interior sem céu.
9. **Docs e cenas**: guia, JSDoc, ROADMAP, PENDENCIAS; cenas e vídeos no claflow-web.
10. **Fechamento**: smokes 3× (fonte e `--dist`), `bench:check`, `npm run ci`, vídeos enviados.

## Riscos

| #   | Risco                                                                                                                                                                                                        | Mitigação                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ligações por estágio**: o contribuinte de `light_transmission` entra em todo pipeline que lê a luz, inclusive o `refraction_path`, o estágio com mais ligações                                             | A contagem por estágio é medida na Fase 1 e depois de cada contribuição e verificada contra os limites do adaptador pela composição real (`flowBinding/limits.ts`); a forma de cada dado (textura amostrada ou buffer) se escolhe pelo custo e pela filtragem.                              |
| 2   | A aproximação por oitavas não chegar a 5 % do traçador em toda região (SC-001)                                                                                                                               | Calibrar a, b, c contra o traçador na Fase 2; se a borda fina não fechar, o erro é medido por região e o critério é ajustado com racional escrito (memória "princípio dos limiares"), sem falsear a imagem.                                                                                 |
| 3   | Rastro ou sal e pimenta na reconstrução com vento forte e câmera rápida (a lição dos blocos 2 × 2 da 034)                                                                                                    | Reprojeção pela profundidade da nuvem e pelo vento, gradiente temporal da 034, smoke de antisserrilhado com nuvens e vento.                                                                                                                                                                 |
| 4   | Orçamento de 3 ms estourar no M4                                                                                                                                                                             | Medida por passe desde a primeira marcha; tetos por perfil; a marcha em duas velocidades e a saída antecipada; o panorama e a sombra fatiados.                                                                                                                                              |
| 5   | Névoa e nuvem sobrepostas (câmera dentro da nuvem com névoa local) violam a ordem "névoa na frente" da composição (R13)                                                                                      | Caso coberto no smoke; erro medido; se relevante, a marcha da nuvem lê a transmitância dos froxels no ponto (eles já estão ligados no estágio).                                                                                                                                             |
| 6   | A perspectiva aérea em toda a geometria (FR-022) muda a imagem de todas as cenas com `Sky` e acrescenta ≈ 0,2 ms às cenas do bench com céu (`global-illumination`), o que pode passar de 10 % numa cena leve | Mudança correta: as fixtures são regravadas e relatadas com a montagem antes/depois, e o baseline das cenas com `Sky` é regravado com o custo medido e o racional (o custo novo é a atmosfera, não uma regressão); a referência da atmosfera até 2, 10 e 30 km (SC-009) prova a imagem nova |
| 7   | Precisão do deslocamento do vento em sessões longas                                                                                                                                                          | Redução módulo o período em f64 no empacotamento (R6); teste de 24 h simuladas.                                                                                                                                                                                                             |
| 8   | O tempo (R19): o vento por raiz numérica em f32 e as derivadas por diferenças finitas na GPU; a torre até a tropopausa numa casca de ~10 km (passos mais longos para as nuvens rasas do tempo bom)                | Teto constante na raiz (16 + 24), estêncil `L/64` (erro ~2·10⁻⁴), o caso `pressure-wind` contra a referência a 1 %; `storm` mede a torre e a bigorna e a imagem contra a referência; o custo no `weather-timing` (SC-012). |

## Complexity Tracking

| Ponto                              | Por que é necessário                                                            | Alternativa mais simples rejeitada                                              |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Ponto novo `sky_cover`             | A nuvem tapa o céu (composição), e `scene_environment` só soma                  | Somar a diferença no `scene_environment` (acopla a nuvem à fórmula do céu)      |
| Perspectiva aérea no céu           | FR-012 e FR-022: a nuvem e a geometria distantes esmaecidas e azuladas          | Só nas nuvens (incoerente com a montanha à mesma distância) ou ignorar          |
| Mapa de transmitância visto do sol | A sombra parcial em todos os receptores por um ponto só                         | Marchar até o sol em cada receptor (caro, repetido em vários estágios)          |
| Panorama das nuvens                | Os raios que escapam (GI, refração, reflexo) veem as nuvens sem marchar cada um | Marchar por raio (milhares de raios das sondas)                                 |
| Rastreamento delta no traçador     | Verdade para calibrar o múltiplo espalhamento em meios de quilômetros           | Marcha de 512 passos do traçador atual (viés e custo em meios densos e grandes) |
| Estado do tempo pela série 037     | As nuvens se formam e se desfazem em τ e andam com o vento local (US5)           | O alvo direto a cada quadro (sem inércia e sem o transporte pelo vento local)   |
| Vento gradiente com atrito         | Curvatura nas baixas intensas e o equador contínuo (FR-025)                      | Só o geostrófico (diverge no equador; erra 30–50 % numa baixa intensa)          |
