# Implementation Plan: Refração pela estrutura de raios e as falhas antigas

**Branch**: `feature/034-ray-refraction-debts` | **Date**: 2026-10-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/034-ray-refraction-debts/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md)
(F4, débito R1 da 011) · Pendências: [`specs/PENDENCIAS.md`](../PENDENCIAS.md) (R1, H1, H4, H5) · Base: a 033 (estrutura de
raios, materiais nos acertos, `scene_lighting` fora do desenho)

## Summary

1. **Refração por raio (C3/C4)**: a camada da frente dos materiais com transmissão grava pedidos por pixel; um estágio
   de compute traça o raio refratado pela estrutura de raios da 033 — interfaces encadeadas, reflexão interna total,
   absorção pela distância real, dispersão por canal — e calcula no acerto o material das funções `material` e a luz de
   `scene_lighting`; a composição lê a radiância transmitida no próprio pixel (R1–R5). No limite de interfaces, leitura
   bicúbica da cópia deslocada pela profundidade. A camada de trás e a segunda cópia saem.
2. **Água pela mesma refração (C4)**: o `WaterFlow` grava pedidos e compõe pela radiância transmitida; a cópia própria e o
   deslocamento heurístico saem (R6).
3. **Material no acerto desacoplado da GI (C3)**: `ray_hit_material`/`ray_hit_closure` na estrutura de raios, usados pela
   GI e pela refração (R3).
4. **Tempo de GPU (C1/C2, smokes)**: anel de stagings, leitura entregue uma vez por `frameComplete`, coletor por
   `gpuFrame` e medidor por repetição nos smokes; nada por backend (R8).
5. **Falhas herdadas**: bissecção, causa medida e correção no motor para as cáusticas do lago e agitadas, o pano, o
   xadrez, o olho de peixe e a caixa 181; desempenho do `fluidSurface` reavaliado (R9).
6. **Verificação**: smoke `refraction` com referência analítica na CPU; bateria inteira no fonte e `--dist`;
   `bench:check`; `npm run ci`; vídeos.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU (compute, storage, despacho indireto, timestamp-query opcional); sem dependências novas

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (`countingCore`, `renderHarness`): `Refraction` (alocação sob demanda por evento, descritores),
`ForwardFlow` (pedidos no lugar das camadas de trás/frente, composição), `WaterFlow` (pedidos, sem `background`),
`ray_hit_material` (composição por cena, GI e refração), `GpuProfilerSystem` (anel, entrega única, descarte contado),
`GpuEngineCore`/`ExecutionSystem` (frescor nos `frameComplete`), referência analítica de refração na CPU; smokes de
navegador (fonte e `--dist`): `refraction` (novo), todos os existentes sem exceção; `bench:check`; `npm run ci`

**Target Platform**: Chrome/Edge com WebGPU em qualquer backend (Metal no Apple M4 — referência de desenvolvimento;
D3D12/Vulkan na NVIDIA RTX 4090 — validação do usuário)

**Project Type**: biblioteca (engine)

**Performance Goals**: refração ≤ 15 % do quadro a 60 Hz (≤ 2,5 ms) a 1280×720 com o vidro em um quarto da tela (princípio dos limiares da spec); sem transmissão, custo inalterado;
água a 64 mil partículas sem regressão com a refração nova; desempenho do `fluidSurface` ≤ 16,7 ms pela medida
corrigida

**Constraints**: sem helpers (Resource + evento + Flow); dispatch só grava; nenhuma leitura de volta por quadro;
trajetórias bit a bit; um símbolo WGSL por pipeline; contrato de shader da 031; C3/C4 importam só a C2; sem ramos por
fornecedor/backend; critérios de smoke só mudam com medida registrada

**Scale/Scope**: C3 (`Refraction`, `RefractionFlow`, `raytrace/refraction_*.wgsl`, `ray_hit_*`); C4 (`ForwardFlow`,
`WaterFlow`, `water_composite.wgsl`, `forward_transmission.wgsl`, defaults); C1 (`GpuProfilerSystem`, `GpuEngineCore`,
docs do `EngineCore`); C2 (`ExecutionSystem` só se o frescor exigir); smokes e `support/`; correções das falhas onde a
causa estiver; bench; docs

## Constitution Check

| Princípio                       | Avaliação                                                                                                | Status |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Refração e acertos na C3; passes na C4; profiler na C1; C3/C4 só pela C2                                 | ✅     |
| **II. Domínio na borda**        | Autoria dos materiais inalterada; `Refraction` só com `maxInterfaces`/`roughnessBlur`                    | ✅     |
| **III. Resource como contrato** | `Refraction` com descritores (pedidos, lista, radiância) sob demanda                                     | ✅     |
| **IV. ECS e Flows**             | `RefractionFlow` com ordem declarada (pedidos → traçado → desfoque → composição); entra/sai por evento   | ✅     |
| **V. Testes**                   | CPU para descritores, transições, anel do profiler e referência analítica; GPU por smokes (fonte e dist) | ✅     |
| **VI. Documentação**            | Guias de raios e materiais (refração), benchmark (tempo de GPU), ROADMAP, PENDENCIAS                     | ✅     |
| **Restrições técnicas**         | Sem deps; API por acréscimo; `FrameStats` mantém a forma (muda só quando os campos aparecem)             | ✅     |
| **Quality gates**               | `npm run ci` + 31 smokes (fonte e `--dist`) + `bench:check`                                              | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — os [contratos](./contracts/) não mudam a autoria; a refração entra pelos pontos de
cena existentes; a mudança de `FrameStats` é de frequência, não de forma (consumidores que leem a última leitura usam
`lastFrameStats()`).

## Project Structure

### Documentation (this feature)

```text
specs/034-ray-refraction-debts/
├── plan.md
├── research.md          # Estado atual, falhas medidas, decisões R1–R10
├── data-model.md
├── quickstart.md
├── contracts/refraction.md, contracts/gpu-timing.md
├── causes.md            # Causa de cada falha herdada (na implementação)
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/elements/raytrace/Refraction.ts, RefractionFlow.ts (NOVOS)               # recurso sob demanda, traçado, desfoque
src/elements/gpu/wgsl/raytrace/refraction_trace.wgsl, refraction_blur.wgsl (NOVOS)
src/elements/gpu/wgsl/raytrace/ray_hit.wgsl (de gi/gi_hit.wgsl)               # ray_hit_closure / ray_hit_material
src/elements/raytrace/shaders.ts, src/elements/lighting/ProbeFlow.ts, lighting/shaders.ts  # GI no ponto novo
src/elements/gpu/wgsl/forward_transmission.wgsl                              # pedidos + composição (sem cópia ampliada)
src/presentation/flows/ForwardFlow.ts, scene_copy_mips.wgsl                  # sem camada de trás; bicúbica no limite
src/presentation/flows/WaterFlow.ts, presentation/water/wgsl/water_composite.wgsl, app/WaterSurface.ts
src/presentation/flows/defaults.ts                                           # Refraction por evento
src/core/gpu/profiler/GpuProfilerSystem.ts, core/gpu/GpuEngineCore.ts, core/contracts/{FrameStats,EngineCore}.ts
src/scene/systems/ExecutionSystem.ts                                         # frescor do frameComplete (se preciso)
src/__smokes__/refraction.ts (NOVO), support/refractionReference.ts, support/gpuTiming.ts (NOVOS)
src/__smokes__/{fluidSurface,materials,fluidField,nodeGraphs,rayScene,globalIllumination,fog}.ts  # medição comum
(arquivos das causas de H4/H5 — definidos pela bissecção)
clay-engine-doc/docs/guides/ (raios, materiais/refração, benchmark), specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; refração e materiais nos acertos na C3, passes e política sob demanda na C4,
medição na C1; as correções das falhas ficam onde a bissecção apontar a causa.

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: estado de partida (ci, 31 smokes no fonte e `--dist`, bench); `causes.md` com as medidas de partida.
2. **Fundação — medição (US2)**: anel de stagings, entrega única, docs do `EngineCore`; `support/gpuTiming.ts`
   (coletor e medidor por repetição) e os smokes que medem tempo migrados; desempenho do `fluidSurface` reavaliado
   (otimizar se ainda passar de 16,7 ms). Vem primeiro porque mede o custo da refração.
3. **Fundação — acertos**: `ray_hit_closure`/`ray_hit_material` desacoplados; GI migrada sem mudar a imagem (fixtures
   e smokes da 033 iguais).
4. **US1 refração**: referência analítica na CPU; `Refraction` + transições; pedidos na camada da frente; traçado
   (interfaces, reflexão interna, absorção, dispersão, parede fina, limite com bicúbica e profundidade); desfoque da
   rugosidade; composição; camada de trás e segunda cópia retiradas; smoke `refraction` (SC-001–SC-004).
5. **US1 água**: pedidos pelo `WaterFlow`, saída do volume por `ray_volume_hit`, composição; `background` retirada;
   smokes da água e fixtures afetadas.
6. **US3 cáusticas**: bissecção e causa do lago e da agitada; correção; fixture de estado do lago gravada.
7. **US4 smokes visuais**: bissecção e causa do pano, do xadrez, do olho de peixe e da caixa 181; correções.
8. **Fixtures**: as que mudam pela refração (materiais com vidro, água) regravadas com montagem antes/depois e a lista
   em `fixtures.md`.
9. **Docs**: guias (raios, materiais/refração, benchmark/tempo de GPU), ROADMAP (R1 resolvido), PENDENCIAS (R1, H1, H4,
   H5 baixadas).
10. **Fechamento**: 31 smokes no fonte e `--dist`, `bench:check` e baseline, `npm run ci`, vídeos.

## Complexity Tracking

| Ponto                                    | Por que é necessário                                             | Alternativa mais simples rejeitada                                             |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Traçado em compute com pedidos por pixel | Nitidez independente da ampliação; orçamento de ligações próprio | Raio no fragmento (limite de storage por estágio); só bicúbica (tela ampliada) |
| Desfoque da rugosidade em espaço de tela | Rugosidade determinística, sem ruído no movimento                | Cone por raios com acúmulo temporal (ruído, reprojeção)                        |
| Anel de stagings no profiler             | Nenhum quadro pulado e cada leitura entregue uma vez             | Média/mediana sobre repetições (mede errado, esconde patamares)                |
| Bissecção por falha                      | Causa raiz no motor, não no critério                             | Ajustar limiares (proibido pela spec)                                          |
