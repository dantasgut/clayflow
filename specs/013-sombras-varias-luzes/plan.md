# Implementation Plan: Sombras para várias fontes de luz

**Branch**: `feature/013-sombras-varias-luzes` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-sombras-varias-luzes/spec.md` · Pesquisa: [research.md](./research.md) ·
Base: a 034 (mapa de sombra virtual por páginas), o #54 (a sombra da luz que gira, a espessura pelo nível de página), a
033/039 (estrutura de raios) e a 037 (canal temporal, filtro temporal)

## Summary

1. **Atlas único (C3)**: o Resource de cena `ShadowAtlas` — as páginas físicas, as tabelas e os pedidos de todas as
   vistas num buffer só; cada vista com a sua faixa (`tableBase`, `requestBase` na `ShadowMatrix`). O `ShadowMap` deixa
   de declarar atlas e pedidos próprios e passa a declarar as suas vistas (R2, R3).
2. **Vistas de sombra (C3)**: direcional = 1 vista ortográfica; foco = 1 em perspectiva; pontual = 6 em perspectiva. O
   `ShadowMatrixFlow` escreve o referencial de cada vista; a série `ShadowMatrix` continua por vista (R3, R4).
3. **Páginas e desenho por vista (C4)**: o `ShadowFlow` e o `ShadowRequestFlow` percorrem as vistas vivas com teto
   constante; o trabalho (`ShadowWork`) em faixas por vista; o orçamento de páginas repartido entre as vistas, a
   reserva grossa de cada uma primeiro (R7).
4. **Leitura (C3)**: `shadow_virtual*.wgsl` com a base da vista; contribuições `light_visibility` e `light_thickness`
   por luz para direcional, foco e pontual (a face do cubo escolhida pela direção); a espessura por luz, não "a última
   que conhece" (R6).
5. **Luzes de área (C3 + C4)**: `RectLight.castShadow`; o `AreaShadowFlow` — raios do pixel visível a pontos do
   retângulo pela estrutura de raios, meia resolução, série 037 por luz, `TemporalFilter`; lida por `light_visibility`
   (e a espessura pelo mesmo passe) (R5, R6).
6. **Aviso (C3)**: o evento `shadowUnavailable` e a luz sem sombra quando fica fora dos tetos (R8).
7. **Perfis e limites**: `RENDER_PROFILES` com os tetos de vistas, de luzes de área e de páginas; o reservatório pelo
   adaptador; a contagem de ligações por estágio registrada antes e depois (R9).
8. **Verificação**: referência f64 `rectVisibility.ts`; casos novos nos smokes `lighting` e `materials`; os smokes
   existentes sem regressão; o retrato no claflow-web (R12).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; nenhuma dependência nova de runtime

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 — as faixas do atlas (bases, tamanhos, sem sobreposição), a lista de vistas por tipo de luz, as
matrizes das vistas em perspectiva e das faces do cubo, a escolha da face pela direção, a composição das contribuições
por luz (visibilidade e espessura), o evento de aviso, a referência f64 da fração visível do retângulo, a repartição do
orçamento (espelho da fila), a contagem de ligações por estágio; smokes de navegador: `lighting` (casos `shadow-sum`,
`sun-travel` com várias luzes, `spot-shadow`, `point-shadow`, `rect-shadow`, `*-travel`, `shadow-limit`,
`shadow-timing`) e `materials` (`subsurface-two-lights`); os existentes que usam sombra

**Target Platform**: Chrome/Edge com WebGPU; piso Apple M4 (`apple-metal-3`); nada específico de fabricante

**Project Type**: biblioteca (engine) + cenas no app `claflow-web`

**Performance Goals** (M4, 1280 × 720, perfil alto): cada direcional com sombra a mais ≤ 1,5 ms parada e ≤ 3 ms em
movimento; uma luz de área com sombra ≤ 3 ms; a cena de uma luz só ≤ 5 % acima de antes

**Constraints**: Resource + evento + Flow, sem helpers, sem `core.create` em Flow; nada na CPU por quadro; estado entre
quadros só pelo canal 037; laços de GPU com teto constante (vistas, luzes de área, raios por pixel); produção não
importa `reference/`; os limites de ligação são os do adaptador, verificados pela composição real; sombra calculada
contra a geometria a cada quadro; um atlas só

**Scale/Scope**: C3 (`ShadowAtlas`, `ShadowMap`, luzes, pontos de cena, leitura da sombra, `AreaShadowFlow`, perfis); C4
(`ShadowFlow`, `ShadowRequestFlow`, estágios padrão); referência; smokes; cenas no claflow-web; docs

## Constitution Check

| Princípio                       | Avaliação                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I. Camadas e importação**     | `ShadowAtlas`, vistas, contribuições e o `AreaShadowFlow` na C3; páginas e desenho na C4, onde já estão; tudo pelos contratos da C2                                                        |
| **II. Domínio na borda**        | Autoria por `castShadow` em cada luz e pelas opções de sombra da luz; vistas, faixas, páginas e raios são internos                                                                         |
| **III. Resource como contrato** | O atlas, as tabelas e os pedidos são descritores do `ShadowAtlas`; as séries da luz de área, descritores com histórico; nenhum buffer criado em Flow                                       |
| **IV. ECS e Flows**             | `ShadowFlow`, `ShadowRequestFlow`, `ShadowMatrixFlow` e `AreaShadowFlow` com fase e prioridade declaradas; as vistas vivas por slot de entidades; o aviso por evento                       |
| **V. Testes**                   | Referência f64 da luz de área; cada tipo de luz com caso parado e em movimento; a soma de luzes; os existentes sem regressão                                                               |
| **VI. Documentação**            | Guia de luzes e sombras atualizado; JSDoc nos exports; ROADMAP (`013`) e PENDENCIAS                                                                                                        |
| **VII. Série temporal**         | `ShadowMatrix` por vista, os pedidos e o atlas continuam séries da 037; a visibilidade da luz de área é série por luz, filtrada pelo `TemporalFilter`; nenhum estado privado entre quadros |
| **Restrições técnicas**         | Sem dependências; API aditiva (`castShadow` na `RectLight`, o evento, os tetos nos perfis); `ShadowMap` deixa de ter atlas próprio (interno)                                               |
| **Quality gates**               | `npm run ci` + os smokes de sombra, novos e existentes                                                                                                                                     |

Sem violação. Uma observação em Complexity Tracking (a sombra da luz de área por raios).

## Project Structure

### Documentation (this feature)

```text
specs/013-sombras-varias-luzes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── shadows.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/elements/scene/
├── ShadowAtlas.ts                 # novo: o atlas único (páginas, tabelas, pedidos por vista)
├── ShadowMap.ts                   # as vistas da luz; sem atlas nem pedidos próprios
├── shadowCaster.ts                # as vistas vivas e os tetos (sai "o primeiro")
├── DirectionalLight.ts · SpotLight.ts · PointLight.ts · RectLight.ts
├── resources.ts                   # `shadow_atlas` pelo `ShadowAtlas`
├── points/shadowContribution.ts   # visibilidade e espessura por luz e por tipo
├── points/lighting.ts             # a espessura composta por luz
└── reference/rectVisibility.ts    # novo: a fração visível do retângulo (f64)

src/elements/lighting/areaShadow/  # novo
├── AreaShadowFlow.ts              # raios do pixel à fonte, série por luz, filtro temporal
└── shaders.ts

src/elements/gpu/wgsl/
├── kernels/shadow_matrix*.wgsl    # o referencial por vista (ortográfica, perspectiva, face do cubo)
├── math/shadow_virtual*.wgsl      # a base da vista; a vista em perspectiva
└── lighting/area_shadow*.wgsl     # novo

src/presentation/flows/
├── ShadowFlow.ts · ShadowRequestFlow.ts · renderSchemas.ts · shaders.ts
└── shadow_pages.wgsl · shadow_request*.wgsl · shadow_depth.wgsl

src/elements/render/Renderer.ts    # os tetos por perfil
src/__smokes__/lighting.ts · materials.ts
```

**Structure Decision**: a sombra por páginas continua onde está (C3 para o dado e a leitura, C4 para as páginas e o
desenho); o atlas vira um Resource de cena; a luz de área ganha uma pasta própria em `lighting/`, ao lado da GI, de
quem reaproveita a estrutura de raios e o filtro.

## Complexity Tracking

| Observação                              | Por que é preciso                                                                                                                                           | Alternativa mais simples rejeitada                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A luz de área usa raios, não as páginas | A sombra de uma fonte extensa é a fração da fonte visível do ponto (FR-006); as páginas guardam a profundidade vista de um ponto e não dão essa fração (R5) | Mapa do centro do retângulo com busca de bloqueadores: erra a penumbra de fontes grandes e não fecha o critério contra a referência |
| A vista de sombra como unidade          | Direcional, foco e pontual diferem só no referencial; uma unidade só evita três caminhos de páginas                                                         | Um caminho por tipo de luz (mapa de cubo para a pontual): estrutura paralela, sem cache nem orçamento comuns                        |
