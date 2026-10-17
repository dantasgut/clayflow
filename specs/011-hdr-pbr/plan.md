# Implementation Plan: HDR e materiais físicos por nós

**Branch**: `feature/011-hdr-pbr` | **Date**: 2026-10-15 (revisado em 2026-10-16, após a 031) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-hdr-pbr/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md) (F4,
critério "superior ao Three.js") · Base: a 031 (grafos de nós, contratos de shader, pontos de cena) · Baseline: o
regravado na 010

## Summary

Abre a F4 trocando o desenho Lambert de 8 bits por um desenho físico em HDR, com materiais compostos por nós:

1. **HDR e apresentação (C4)**: `FrameTargets` em `rgba16float`; o passthrough do pós vira a apresentação — exposição,
   AgX/ACES/neutro, sRGB e pontilhamento, com **resolve mapeado por amostra** do MSAA; saída HDR estendida quando há
   suporte (R1, R2).
2. **Funções físicas (C3)**: biblioteca `bsdf` — GGX (iso e aniso) + Smith correlacionado + Fresnel/F82, difuso
   energético, sheen, filme fino, subsuperfície no modelo, multiespalhamento por tabela DFG gerada em compute, controle
   de serrilhado especular (R3).
3. **Materiais por nós (C3)**: o ponto `material` devolve um **fechamento** (`Closure`); nós `bsdf.*` (um lobo cada) e
   `closure.*` (mix, add, layer, thin film, opacidade, normal); especialização pelos lobos presentes no grafo; tangente
   por nó (R4, R5); `SurfaceParams` da 009 continua válido (R8); OpenPBR é o sub-grafo `nodes.material.openpbr`.
4. **Luzes por pontos de cena (C3)**: `scene_lighting` somando contribuições de `DirectionalLight`, `PointLight`, novo
   `SpotLight` e novo `HemisphereLight` (no lugar da constante 0,18); sombra e água por luz (R7). O forward, os sprites
   e a água não conhecem nenhuma luz.
5. **Transmissão (C4)**: cópia de cena com mips compartilhada com a água, passe de transmissivos em duas camadas por
   descasque de profundidade, refração com dispersão (R6).
6. **Água e cáusticas (C3 + C4)**: a água no mesmo modelo, sem corte; cáusticas por malha refratada com mistura
   aditiva e leitura bicúbica (R9, R10).
7. **Biblioteca** de 23 materiais prontos como sub-grafos (R11); **comparação** com o Three.js por cena de bench e
   medidas (R12); fixtures regravadas uma vez, listadas (R13); vídeos (R14).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU (canvas `toneMapping: 'extended'` opcional; `rgba16float` renderizável e filtrável —
núcleo do WebGPU); Three 0.186 só no bench; sem dependências novas

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (`countingCore`): formatos dos `FrameTargets`, cadeia do pós com a apresentação (com e sem
efeitos; leitura multiamostrada só sem efeitos), parâmetros de apresentação; nós BSDF e de fechamento (assinaturas,
lobos declarados, máscara do grafo → chave do pipeline, valores sem recompilar, topologia em transição), adaptador das
duas assinaturas do ponto `material`, sub-grafos da biblioteca (valores expostos, serialização ida e volta);
contribuições de luz ao `scene_lighting` (spot, cones, limite e aviso), `HemisphereLight` nos estágios padrão, nenhum
estágio importando classes de luz; `PbrTables` gerada uma vez; passe de transmissivos só com transmissivos; cópia de
cena com mips só quando há consumidor; malha de cáusticas; obsolescência da água; referências de CPU (BRDF, Fresnel/F82,
fusão de lobos, AgX/ACES/neutro, filme fino, atenuação); smokes de navegador (inclusive `--dist`): `hdr`, `lighting`,
`materials` (novos), `nodeGraphs` (grafo de material), `fluidSurface` e `parametricSurfaces` (água/cáusticas) e todos
os existentes com as fixtures de imagem regravadas; `bench:check`; `npm run ci`

**Target Platform**: Chrome/Edge com WebGPU (perfil de referência Apple Metal 3)

**Project Type**: biblioteca (engine)

**Performance Goals**: `bench:check` sem regressão relevante (o HDR dobra a banda da cor: custo esperado ≤ 0,3 ms a
1280×720 com MSAA 4×, medido e registrado); `point-lights` (256 luzes) com tempo de quadro ≤ o do Three; galeria de
materiais ≤ o do Three; malha de cáusticas 2048² vértices ≤ 1,5 ms; material de grafo com os mesmos lobos que o pronto
com custo igual ao pronto (± ruído)

**Constraints**: sem helpers (Resource + evento + Flow); dispatch só grava; nenhuma leitura de volta por quadro;
trajetórias bit a bit; um símbolo WGSL por pipeline (`brdf.wgsl` substituído por `bsdf`/`closure`, sem duplicatas);
contrato de shader da 031 (recursos declarados, pontos de cena, nenhum estágio conhece luz/água/sombra pelo nome);
C3/C4 importam só a C2; acréscimo na C1 só por opção do canvas (`CanvasOptions.toneMapping`/`format`) pedida pela C4;
sem ciclos

**Scale/Scope**: C3 (nós `bsdf`/`closure`/`geometry`/`color`/`material`, ponto `material`, luzes e contribuições,
`bsdf`/`closure`/`present` WGSL, tabela DFG, sprites, água, biblioteca); C4 (`FrameTargets`, `PostFlow`/apresentação,
`ForwardFlow` com passe de transmissivos e especialização por lobos, `WaterFlow`, `CausticsFlow`, `WaterSurface`,
estágios padrão); C2 (metadado de lobos na definição de nó e na compilação, se o núcleo do grafo precisar); C1 (opção
do canvas); smokes; bench; docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                                                | Status |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Nós, fechamento, luzes e WGSL na C3; alvos, apresentação e passes na C4; metadado de lobos genérico na C2 (o grafo não conhece BSDF); a saída HDR chega à C1 pela configuração do canvas | ✅     |
| **II. Domínio na borda**        | Autoria em vocabulário físico (IOR, rugosidade, lux, candela, nits, EV, nm) e por nós; layouts, máscara de lobos e struct `Closure` são internos                                         | ✅     |
| **III. Resource como contrato** | `ToneMapping`, `HemisphereLight`, `SpotLight`, `PbrTables`, `MaterialFunction` e os alvos novos dos `FrameTargets` são Resources com descritores                                         | ✅     |
| **IV. ECS e Flows**             | Tabela DFG, cópia com mips, passe de transmissivos, variantes por lobos e malha de cáusticas preparados em transições; `dispatch` só grava; luzes por contribuição de cena               | ✅     |
| **V. Testes**                   | CPU para descritores, chaves, adaptadores, nós e referências numéricas; GPU por smokes com medidas (fonte e dist); fixtures regravadas uma vez, listadas                                 | ✅     |
| **VI. Documentação**            | Guias de materiais (nós BSDF), luzes e apresentação; grafos de nós (biblioteca nova); arquitetura (ordem dos passes, pontos de luz); ROADMAP; PENDENCIAS; JSDoc                          | ✅     |
| **Restrições técnicas**         | Sem deps; API por acréscimo (`StandardMaterial` inalterado; `SurfaceParams` válido; `FluidSurfaceMaterial` com obsolescência, não remoção)                                               | ✅     |
| **Quality gates**               | `npm run ci` + smokes (fonte e `--dist`) + `bench:check`                                                                                                                                 | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/rendering.md) mantém a função `material` da 009 válida;
o `StandardMaterial` não cresce (as camadas vêm do grafo); as luzes seguem o padrão de pontos de cena da 031; a única
mudança na C1 é uma opção de configuração do canvas; a cópia de cena passa a ser dado do Resource `FrameTargets` (a
água deixa de ter cópia privada).

## Project Structure

### Documentation (this feature)

```text
specs/011-hdr-pbr/
├── plan.md
├── research.md          # Achados A1–A14, decisões R1–R14
├── data-model.md
├── quickstart.md
├── contracts/rendering.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/core/gpu/GpuEngineCore.ts, core/contracts/EngineCore.ts               # CanvasOptions.toneMapping/format
src/scene/graph/NodeDefinition.ts, NodeGraph.ts                           # metadado genérico (ex.: `tags`) e união na compilação
src/elements/material/point/shaders.ts                                    # ponto `material` com Closure e SurfaceParams
src/elements/material/MaterialFunction.ts                                 # `lobes` (código); máscara do grafo
src/elements/material/PbrTables.ts (NOVO), FluidSurfaceMaterial*.ts
src/elements/material/Materials.ts (NOVO)                                 # fábricas → MaterialFunction
src/elements/nodes/bsdf/, closure/, geometry/, color/, material/ (NOVOS); output/ (+ closure)
src/elements/gpu/wgsl/math/bsdf.wgsl, closure.wgsl, present.wgsl (NOVOS); brdf.wgsl (só sombra)
src/elements/gpu/wgsl/nodes/bsdf.wgsl, closure.wgsl, geometry.wgsl, color.wgsl (NOVOS)
src/elements/gpu/wgsl/kernels/pbr_dfg_build.wgsl (NOVO), scene_copy_mips.wgsl (NOVO)
src/elements/scene/Light.ts, SpotLight.ts (NOVO), HemisphereLight.ts (NOVO), DirectionalLight.ts, PointLight.ts
src/elements/scene/points/lighting.ts (scene_lighting, light_visibility/transmission por luz), lightContributions.ts (NOVO)
src/elements/gpu/wgsl/material_point_types.wgsl, forward.wgsl, forward_material_*.wgsl, forward_transmission.wgsl (NOVO)
src/elements/gpu/wgsl/particle_sprite.wgsl, point_sprite.wgsl, diffuse/diffuse_sprite.wgsl
src/presentation/water/wgsl/water_composite.wgsl, caustics.wgsl, caustic_mesh.wgsl (NOVO)
src/presentation/app/FrameTargets.ts, WaterSurface.ts
src/presentation/resources/ToneMapping.ts (apresentação), flows/PostFlow.ts, flows/effects/present.wgsl (NOVO)
src/presentation/flows/ForwardFlow.ts (variantes por lobos, transmissivos), WaterFlow.ts, CausticsFlow.ts, defaults.ts
src/__smokes__/hdr.ts, lighting.ts, materials.ts (NOVOS) + support/materialScenes.ts (NOVO); fixtures regravadas
bench/scenes/materials (NOVA), bench/scenes/point-lights/clayflow.ts (NOVO), bench/scenes/particles (water-lake)
bench/engines/three.ts                                                    # MSAA + tone mapping equivalentes
clay-engine-doc/docs/guides/ (materiais, luzes, apresentação, grafos de nós, arquitetura), specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; nós, fechamento e luzes no domínio do material/cena (C3); o núcleo do grafo
(C2) ganha só um metadado genérico de definição unido na compilação (não conhece BSDF); alvos, apresentação e ordem dos
passes na C4. A C1 recebe só a opção de configuração do canvas.

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: números de partida do bench (máquina livre); smokes `hdr`, `lighting`, `materials` com casos vazios e as
   medidas (rampa, forno, BRDF de referência na CPU); ROADMAP §3.3 (matriz normal já resolvida, A5).
2. **Fundação HDR**: `FrameTargets` `rgba16float` (+ `sceneCopy`, `transmissionDepth`); `ToneMapping` como
   apresentação; `present.wgsl`; `PostFlow` com a apresentação no fim e o resolve por amostra; opção de canvas HDR;
   pingue-pongue e `WaterSurface` em HDR; testes.
3. **US1 HDR**: casos `hdr-range`, `hdr-ramp` (faixas), `hdr-exposure`, `hdr-operators`, `hdr-output` (fallback).
4. **Fundação do fechamento**: `bsdf.wgsl`, `closure.wgsl` (struct, construtores, mix/add/layer, `closure_eval`
   especializável, `closure_ambient`, `closure_from_params`), `PbrTables`; metadado de lobos na C2; ponto `material`
   com os dois retornos; fechamento pronto; referências de CPU.
5. **US2 iluminação**: ponto `scene_lighting` e contribuições (direcional, pontual, spot, hemisfério); sombra e água
   por luz; `SpotLight`, `HemisphereLight` nos estágios padrão; forward e sprites no modelo novo; saem
   `scene_light_direction`/`scene_any_light_direction`; luz explícita nos smokes e cenas de bench; casos
   `brdf-reference`, `furnace`, `point-falloff`, `spot-cones`, `light-sum`, `normal-scale`, `specular-aa`.
6. **US3 materiais por nós**: nós `bsdf.*`, `closure.*`, `geometry.tangentUv`, `color.*`, `output.closure`;
   especialização por lobos (variantes no forward); passe de transmissivos (cópia com mips, duas camadas, refração,
   dispersão, Beer-Lambert, parede fina, opacidade); `nodes.material.openpbr`; casos por lobo, `closure-mix`,
   `closure-layer`, `graph-specialization` e `material-fn-compat`.
7. **US4 água e cáusticas**: `water_composite` no fechamento (Fresnel, GGX, hemisfério, `sceneCopy`, sem corte);
   `FluidSurfaceMaterial.roughness` e obsolescências; malha de cáusticas (compute + render aditivo) e leitura bicúbica
   no contribuinte da água; `lightSize` 1024; casos `water-fresnel`, `water-absorption`, `water-highlight`,
   `caustics-smooth`, `caustics-temporal`.
8. **US5 biblioteca**: 23 sub-grafos `nodes.material.*`, `Materials.*` (→ `MaterialFunction`), registro padrão,
   documentação dos valores; casos `gallery` e `library-compose` (material pronto dentro de um grafo maior).
9. **US6 comparação**: cena `materials` e `point-lights` (Clayflow), variante `water-lake`, Three com MSAA e tone
   mapping equivalentes; página de comparação lado a lado com as medidas (faixas, forno, cintilação, serrilhado).
10. **Fixtures**: regravação única das de imagem (lista + montagem antes/depois); limiares recalibrados; estado bit a
    bit.
11. **Docs**: guias (materiais por nós, luzes, apresentação), grafos de nós (biblioteca BSDF), arquitetura (ordem dos
    passes, pontos de luz), ROADMAP (011 implementada; 014 sem "pós direto no canvas"), PENDENCIAS, JSDoc, API.
12. **Fechamento**: smokes (fonte e `--dist`), `bench:check`, `npm run ci`, baseline regravado, vídeos.

## Complexity Tracking

| Ponto                                    | Por que é necessário                                                                                                        | Alternativa mais simples rejeitada                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Fechamento com lobos fixos e fusão       | Um fragment shader não tem fechamentos dinâmicos; lobos fixos por tipo com fusão documentada (como o EEVEE) compõem por nós | `StandardMaterial` com todos os parâmetros OpenPBR — rejeitado pelo usuário |
| Especialização pelos lobos do grafo      | Uber-shader paga todos os lobos em todo pixel (~3× o base); o grafo já sabe quais lobos existem                             | Uber-shader com ramos dinâmicos — divergência e registradores para todos    |
| Resolve mapeado por amostra              | O resolve linear de bordas HDR de alto contraste serrilha (sol, metal); mapear antes da média corrige                       | Resolve de hardware + mapeamento depois — bordas brilhantes duras           |
| Descasque de duas camadas na transmissão | Vidro atrás de vidro e verso de objeto espesso sem ordenação na CPU (posições na GPU)                                       | Ordenar na CPU — exige ler de volta; uma camada só — o vidro de trás some   |
| Tabela DFG gerada em compute             | Multiespalhamento e albedo do sheen precisam de E(μ, α); gerar na GPU evita arquivo binário                                 | Aproximação analítica — erro > 3 % no teste de forno em rugosidade alta     |
| Malha de cáusticas                       | Reconstrução contínua sem ruído de contagem e com bordas nítidas — o pedido explícito ("sem blocos")                        | Mais fótons + borrão — ruído persiste, bordas borram                        |
| Duas assinaturas do ponto `material`     | Manter as funções da 009 válidas e permitir fechamentos                                                                     | Crescer `SurfaceParams` — quebra toda função existente                      |
