# Implementation Plan: HDR e modelo de material físico em camadas

**Branch**: `feature/011-hdr-pbr` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-hdr-pbr/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md) (F4,
critério "superior ao Three.js") · Baseline: o regravado na 010

## Summary

Abre a F4 trocando o desenho Lambert de 8 bits por um desenho físico em HDR:

1. **HDR e apresentação (C4)**: `FrameTargets` em `rgba16float`; o passthrough do pós vira a apresentação — exposição,
   AgX/ACES/neutro, sRGB e pontilhamento, com **resolve mapeado por amostra** do MSAA; saída HDR estendida quando há
   suporte (R1, R2).
2. **Sombreamento físico (C3)**: Cook-Torrance GGX + Smith correlacionado + Fresnel, compensação de múltiplo
   espalhamento por tabela DFG gerada em compute, controle de serrilhado especular (R3); laço de todas as luzes do pool
   com `SpotLight` novo e `HemisphereLight` explícito no lugar da constante 0,18 (R7).
3. **Material em camadas OpenPBR (C3)**: `StandardMaterial` com base, especular/anisotropia, verniz, transmissão com
   dispersão, parede fina, fuzz, filme fino, subsuperfície, emissão e opacidade; pipelines especializados por máscara
   de camadas (R5); tangente sem mudar o vértice (R4); função `material` com `SurfaceLayers`, compatível com a 009
   (R8).
4. **Transmissão (C4)**: cópia de cena com mips compartilhada com a água, passe de transmissivos em duas camadas por
   descasque de profundidade, refração com dispersão (R6).
5. **Água e cáusticas (C3 + C4)**: a água no mesmo modelo, sem corte; cáusticas por malha refratada com mistura
   aditiva e leitura bicúbica (R9, R10).
6. **Biblioteca** de 23 materiais prontos (R11); **comparação** com o Three.js por cena de bench e medidas (R12);
   fixtures regravadas uma vez, listadas (R13); vídeos (R14).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU (canvas `toneMapping: 'extended'` opcional; `rgba16float` renderizável e filtrável
— núcleo do WebGPU); Three 0.186 só no bench; sem dependências novas

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (`countingCore`): formatos dos `FrameTargets`, cadeia do pós com a apresentação (com e sem
efeitos; leitura multiamostrada só sem efeitos), parâmetros de apresentação, máscara de camadas → chave de grupo e
constantes `override`, adaptador das duas assinaturas da função `material`, pool de luzes (spot, cones, limite e
aviso), `HemisphereLight` nos estágios padrão, `PbrTables` gerada uma vez, passe de transmissivos só com transmissivos,
cópia de cena com mips só quando há consumidor, malha de cáusticas, fábricas da biblioteca (valores), obsolescência da
água; referências de CPU (BRDF, Fresnel, AgX/ACES/neutro, filme fino, atenuação); smokes de navegador (inclusive
`--dist`): `hdr`, `lighting`, `materials` (novos), `fluidSurface` e `parametricSurfaces` (água/cáusticas) e todos os
existentes com as fixtures de imagem regravadas; `bench:check`; `npm run ci`

**Target Platform**: Chrome/Edge com WebGPU (perfil de referência Apple Metal 3)

**Project Type**: biblioteca (engine)

**Performance Goals**: `bench:check` sem regressão relevante (o HDR dobra a banda da cor: custo esperado ≤ 0,3 ms a
1280×720 com MSAA 4×, medido e registrado); `point-lights` (256 luzes) com tempo de quadro ≤ o do Three; galeria de
materiais ≤ o do Three; malha de cáusticas 2048² vértices ≤ 1,5 ms

**Constraints**: sem helpers (Resource + evento + Flow); dispatch só grava; nenhuma leitura de volta por quadro;
trajetórias bit a bit; um símbolo WGSL por pipeline (`brdf.wgsl` substituído por `pbr`/`lighting`, sem duplicatas);
C3/C4 importam só a C2; acréscimo na C1 só por opção do canvas (`CanvasOptions.toneMapping`/`format`) pedida pela
C4; sem ciclos

**Scale/Scope**: C3 (material, luzes, `pbr`/`lighting`/`present` WGSL, tabela DFG, ponto `material`, sprites,
água, biblioteca); C4 (`FrameTargets`, `PostFlow`/apresentação, `ForwardFlow` com passe de transmissivos e
especialização, `WaterFlow`, `CausticsFlow`, `WaterSurface`, estágios padrão); C1 (opção do canvas); smokes; bench;
docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                                  | Status |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Material, luzes e WGSL na C3; alvos, apresentação e passes na C4; a opção de saída HDR chega à C1 pela configuração do canvas pedida via C2 (nenhum valor da C1 atravessa) | ✅     |
| **II. Domínio na borda**        | Autoria em vocabulário físico (IOR, rugosidade, lux, candela, nits, EV, nm); layouts e máscara de camadas são internos                                                     | ✅     |
| **III. Resource como contrato** | `ToneMapping`, `HemisphereLight`, `SpotLight`, `PbrTables`, `StandardMaterial` e os alvos novos dos `FrameTargets` são Resources com descritores                           | ✅     |
| **IV. ECS e Flows**             | Tabela DFG, cópia com mips, passe de transmissivos e malha de cáusticas preparados em transições (`framePrepare`, `resourceReady`); `dispatch` só grava                    | ✅     |
| **V. Testes**                   | CPU para descritores, chaves, adaptadores e referências numéricas; GPU por smokes com medidas (fonte e dist); fixtures regravadas uma vez, listadas                        | ✅     |
| **VI. Documentação**            | Guias de materiais, luzes e apresentação; arquitetura (ordem dos passes); ROADMAP (§3.3 atualizado, 014 ajustada); PENDENCIAS; JSDoc                                       | ✅     |
| **Restrições técnicas**         | Sem deps; API por acréscimo (campos novos com padrão neutro; `FluidSurfaceMaterial` com obsolescência, não remoção)                                                        | ✅     |
| **Quality gates**               | `npm run ci` + smokes (fonte e `--dist`) + `bench:check`                                                                                                                   | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/rendering.md) mantém a função `material` da 009 válida;
a única mudança na C1 é uma opção de configuração do canvas; a cópia de cena passa a ser dado do Resource
`FrameTargets` (a água deixa de ter cópia privada — um consumidor a mais, nenhum buffer privado compartilhado).

## Project Structure

### Documentation (this feature)

```text
specs/011-hdr-pbr/
├── plan.md
├── research.md          # Achados A1–A13, decisões R1–R14
├── data-model.md
├── quickstart.md
├── contracts/rendering.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/core/gpu/GpuEngineCore.ts, core/contracts/EngineCore.ts               # CanvasOptions.toneMapping/format
src/elements/material/StandardMaterial.ts, StandardMaterialSchema.ts      # camadas OpenPBR, máscara
src/elements/material/Materials.ts (NOVO)                                 # biblioteca
src/elements/material/PbrTables.ts (NOVO), FluidSurfaceMaterial*.ts
src/elements/material/point/shaders.ts                                    # duas assinaturas; SurfaceLayers
src/elements/scene/Light.ts, SpotLight.ts (NOVO), HemisphereLight.ts (NOVO)
src/elements/gpu/wgsl/math/pbr.wgsl, pbr_dfg.wgsl, lighting.wgsl, present.wgsl (NOVOS); brdf.wgsl (só sombra)
src/elements/gpu/wgsl/kernels/pbr_dfg_build.wgsl (NOVO), scene_copy_mips.wgsl (NOVO)
src/elements/gpu/wgsl/material_point_types.wgsl, forward.wgsl, forward_material_*.wgsl, forward_transmission.wgsl (NOVO)
src/elements/gpu/wgsl/particle_sprite.wgsl, point_sprite.wgsl, diffuse/diffuse_sprite.wgsl
src/elements/gpu/wgsl/water/water_composite.wgsl, caustics.wgsl, caustic_mesh.wgsl (NOVO)
src/presentation/app/FrameTargets.ts, WaterSurface.ts
src/presentation/resources/ToneMapping.ts (apresentação), flows/PostFlow.ts, flows/effects/present.wgsl (NOVO)
src/presentation/flows/ForwardFlow.ts (especialização, transmissivos), WaterFlow.ts, CausticsFlow.ts, defaults.ts
src/__smokes__/hdr.ts, lighting.ts, materials.ts (NOVOS) + support/materialScenes.ts (NOVO); fixtures regravadas
bench/scenes/materials (NOVA), bench/scenes/point-lights/clayflow.ts (NOVO), bench/scenes/particles (water-lake)
bench/engines/three.ts                                                    # MSAA + tone mapping equivalentes
clay-engine-doc/docs/guides/ (materiais, luzes, apresentação, arquitetura), specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; modelo de material e luzes no domínio do material/cena (C3), alvos,
apresentação e ordem dos passes na C4. A C1 recebe só a opção de configuração do canvas.

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: números de partida do bench (máquina livre); smokes `hdr`, `lighting`, `materials` com casos vazios e as
   medidas (rampa, forno, BRDF de referência na CPU); ROADMAP §3.3 (matriz normal já resolvida, A5).
2. **Fundação HDR**: `FrameTargets` `rgba16float` (+ `sceneCopy`, `transmissionDepth`); `ToneMapping` como
   apresentação; `present.wgsl`; `PostFlow` com a apresentação no fim e o resolve por amostra; opção de canvas HDR;
   pingue-pongue e `WaterSurface` em HDR; testes.
3. **US1 HDR**: casos `hdr-range`, `hdr-ramp` (faixas), `hdr-exposure`, `hdr-operators`, `hdr-output` (fallback).
4. **US2 iluminação**: `pbr.wgsl`, `PbrTables` (DFG em compute), `lighting.wgsl` (laço, atenuação, cones, sombra);
   `SpotLight`, `HemisphereLight` nos estágios padrão; forward e sprites no modelo novo; luz explícita nos smokes e
   cenas de bench; casos `brdf-reference`, `furnace`, `point-falloff`, `spot-cones`, `light-sum`, `normal-scale`,
   `specular-aa`.
5. **US3 camadas**: schema OpenPBR; máscara → chave de grupo e `override`; tangente (R4); verniz, fuzz, filme fino,
   anisotropia, subsuperfície, emissão; `SurfaceLayers` e as duas assinaturas do ponto; passe de transmissivos (cópia
   com mips, duas camadas, refração, dispersão, Beer-Lambert, parede fina, opacidade); casos por camada e
   `material-fn-compat`.
6. **US4 água e cáusticas**: `water_composite` no modelo (Fresnel, GGX, hemisfério, `sceneCopy`, sem corte);
   `FluidSurfaceMaterial.roughness` e obsolescências; malha de cáusticas (compute + render aditivo) e leitura
   bicúbica; `lightSize` 1024; casos `water-fresnel`, `water-absorption`, `water-highlight`, `caustics-smooth`,
   `caustics-temporal`.
7. **US5 biblioteca**: `Materials` (23), documentação dos valores; caso `gallery`.
8. **US6 comparação**: cena `materials` e `point-lights` (Clayflow), variante `water-lake`, Three com MSAA e tone
   mapping equivalentes; página de comparação lado a lado com as medidas (faixas, forno, cintilação, serrilhado).
9. **Fixtures**: regravação única das de imagem (lista + montagem antes/depois); limiares recalibrados; estado bit a
   bit.
10. **Docs**: guias (materiais, luzes, apresentação), arquitetura (ordem dos passes), ROADMAP (011 implementada; 014
    sem "pós direto no canvas"), PENDENCIAS, JSDoc, API.
11. **Fechamento**: smokes (fonte e `--dist`), `bench:check`, `npm run ci`, baseline regravado, vídeos.

## Complexity Tracking

| Ponto                                    | Por que é necessário                                                                                          | Alternativa mais simples rejeitada                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Pipelines especializados por camada      | Uber-shader paga todas as camadas em todo pixel (~3× o base); especializar mantém o custo do material simples | Uber-shader com ramos dinâmicos — divergência e registradores para todos  |
| Resolve mapeado por amostra              | O resolve linear de bordas HDR de alto contraste serrilha (sol, metal); mapear antes da média corrige         | Resolve de hardware + mapeamento depois — bordas brilhantes duras         |
| Descasque de duas camadas na transmissão | Vidro atrás de vidro e verso de objeto espesso sem ordenação na CPU (posições na GPU)                         | Ordenar na CPU — exige ler de volta; uma camada só — o vidro de trás some |
| Tabela DFG gerada em compute             | Multiespalhamento e albedo do sheen precisam de E(μ, α); gerar na GPU evita arquivo binário                   | Aproximação analítica — erro > 3 % no teste de forno em rugosidade alta   |
| Malha de cáusticas                       | Reconstrução contínua sem ruído de contagem e com bordas nítidas — o pedido explícito ("sem blocos")          | Mais fótons + borrão — ruído persiste, bordas borram                      |
| Duas assinaturas da função `material`    | Manter as funções da 009 válidas e permitir camadas                                                           | Crescer `SurfaceParams` — quebra toda função existente                    |
