# Implementation Plan: Traçado em ondas — material fora dos laços de traçado

**Branch**: `feature/039-tracado-em-ondas` (de `feature/038-motor-puro-web`, volta por merge) | **Date**: 2026-10-29 |
**Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/039-tracado-em-ondas/spec.md`; proposta aprovada em [proposta.md](proposta.md)

## Summary

O material nos acertos dos raios sai dos kernels de traçado. Cada rodada de um consumidor (GI, cáusticas, refração)
tem três estágios:

1. **Avanço e traçado**, independente de material: grava os acertos numa onda compartilhada e conta por classe.
2. **Separação na GPU** por classe de material.
3. **Um kernel por material distinto**, gerado do mesmo módulo `composite` do raster: grava o fechamento empacotado de cada acerto.

A continuação de cada efeito roda no avanço da rodada seguinte. O número de rodadas é o orçamento atual de cada efeito.

A refração achata a árvore de ramos em folhas por pixel, reduzidas por ordenação. A pilha da câmera vira uma rodada,
com os acertos enumerados. A compilação passa a ser assíncrona e declarada antes do quadro, e o `engineReady` existente passa a cobrir tudo o que a cena usa.
O seletor composto (`composeHitMaterial`) é removido. Decisões em [research.md](research.md) (R1–R15).

## Technical Context

**Language/Version**: TypeScript 5.9 estrito; WGSL

**Primary Dependencies**:

- WebGPU: Dawn no Chrome, wgpu/naga no Deno 2.7.9.
- Ferramentas de compute do motor: `Compaction`, `PrefixSum`, `RadixSort` e `CountToArgs`.

**Storage**: N/A

**Testing**:

- Vitest: unidade e composição de WGSL.
- Smokes do Chrome pelo runner (headless): `nodeGraphs`, `caustics`, `globalIllumination`, `refraction`, `fluidSurface` e `readiness`.
- Smoke de compilação no Deno, sem submeter trabalho.

**Target Platform**: navegadores com WebGPU e Deno com WebGPU; Mac, Windows e Linux

**Project Type**: biblioteca (motor)

**Performance Goals**:

- Os critérios de custo atuais. O da refração é ≤ 3 ms na lente a 1280×720, ligada menos desligada, no M4.
- Os kernels de traçado não crescem com o número de materiais.

**Constraints**:

- Nenhum laço de GPU atravessa material, e todo laço tem orçamento total.
- Kernel com compilação errada comprovada não vai à GPU.
- Os tamanhos vêm dos limites do adaptador.
- Nada por nome de ambiente.
- Fixtures e critérios sem mudança.

**Scale/Scope**:

- 7 kernels de traçado migrados, 3 Flows consumidores e 1 Flow novo (`RayHitShadingFlow`).
- Recursos novos: `RayWave` e `RayHitShading`. A prontidão reusa a `EngineReadiness`.
- Cerca de 806 linhas de `refraction_path.wgsl` reorganizadas em avanço, continuação e folhas.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                | Como o plano cumpre                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Camadas e importação  | A onda, o material nos acertos e os consumidores ficam na C3 (`elements/raytrace`, `elements/lighting`). O `PipelineState` e a prontidão existente (`EngineReadiness`) ficam na C2; o cache opcional, no contrato da C1 reexportado pela C2. Nenhum import novo da C1 em C3/C4. |
| II. Vocabulário na borda | A API de autoria não muda: os mesmos grafos, `StandardMaterial` e opções de GI, cáusticas e refração. A onda é interna. `engineReady` e `whenReady()` já existem.                                                                                                               |
| III. Resource            | `RayWave` e `RayHitShading` são `Resource` com descriptors; nenhum dado solto.                                                                                                                                                                                                  |
| IV. ECS e Flows          | O Flow novo é `RayHitShadingFlow`. A ordem é declarada: material depois da `RayScene`; consumidores depois do material. As rodadas são passes do consumidor, na ordem atual dos Flows.                                                                                          |
| V. Testes                | Unidade: empacotamento, separação, geração dos kernels, contagem de recursos e prontidão. Os smokes de GPU com os critérios atuais; o de compilação roda no Deno.                                                                                                               |
| VI. Documentação         | JSDoc em todo export novo. O guia de materiais nos raios e o de carga de cena são atualizados.                                                                                                                                                                                  |
| Backend substituível     | Sem mudança.                                                                                                                                                                                                                                                                    |

Sem violações. Re-check depois do desenho: igual. A aleatoriedade por raio (R7) muda o padrão do ruído, não a
distribuição; os critérios são estatísticos.

## Project Structure

### Documentation (this feature)

```text
specs/039-tracado-em-ondas/
├── proposta.md          # a proposta aprovada
├── spec.md
├── plan.md
├── research.md          # R1–R15
├── data-model.md        # RayWave, RayHitRecord/Surface, RayHitShading, estados de caminho, folhas, prontidão
├── contracts/
│   ├── ray-wave.md
│   └── scene-readiness.md
├── quickstart.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── core/contracts/PlatformAdapter.ts            # pipelineCache? (R12)
├── scene/
│   ├── systems/flowBinding/PipelineState.ts     # assíncrono por padrão (R11)
│   └── readiness/EngineReadiness.ts             # existente: engineReady cobre os pipelines declarados antes
├── elements/
│   ├── raytrace/
│   │   ├── RayWave.ts, RayHitShading.ts         # Resources (novos)
│   │   ├── RayHitShadingFlow.ts                 # kernels de material por classe (novo)
│   │   ├── hitShade.ts                          # geração do hit_shade_<hash> (substitui hitMaterial.ts)
│   │   └── shaders.ts                           # módulos da onda
│   ├── gpu/wgsl/
│   │   ├── math/closure.wgsl                    # closure_pack / closure_unpack
│   │   ├── raytrace/ray_wave_*.wgsl             # registro, separação, espalhamento (novos)
│   │   ├── raytrace/ray_hit.wgsl                # o registro do acerto (sem material)
│   │   ├── gi/gi_*_trace.wgsl                   # traçado e continuação separados
│   │   ├── caustics/caustics_trace.wgsl         # instâncias, fótons em rodadas
│   │   └── refraction/refraction_*.wgsl         # câmera enumerada; caminho em avanço e continuação; folhas
│   └── lighting/
│       ├── ProbeFlow.ts                         # rodada da GI
│       ├── caustics/CausticsFlow.ts             # rodadas dos fótons
│       └── refraction/RefractionFlow.ts         # rodadas, folhas e fechamento por pixel
├── __smokes__/
│   ├── readiness.ts                             # engineReady e nenhum quadro compilando depois
│   └── … (os existentes, sem mudar critério)
bench/deno/compile.ts                            # smoke de compilação sem submeter (R14)
```

**Structure Decision**: biblioteca única. Os novos módulos seguem as pastas existentes: a onda e o material nos acertos em `elements/raytrace`, os consumidores em `elements/lighting`, a prontidão na C2.

## Fases de implementação (ordem da proposta)

1. **Medição (R13):**
   - micro-benchmark do custo dos despachos indiretos (kernels sem laço) no Chrome;
   - registro dos tempos atuais de GI, cáusticas e refração (a linha de base).
2. **Fundação:**
   - `closure_pack`/`unpack`;
   - `RayWave` com a separação;
   - `RayHitShading` e o `RayHitShadingFlow`, com a geração dos kernels;
   - testes de composição e unidade.
3. **Cáusticas por instância** na onda. É o primeiro consumidor e valida a fundação no smoke `caustics`.
4. **GI:** sondas e tela, uma rodada. Smoke `globalIllumination`.
5. **Cáusticas, fótons:** em rodadas. Smoke `caustics`.
6. **Refração:**
   - a câmera, com os acertos enumerados;
   - os pixels: avanço e continuação, os ramos achatados em folhas, o lobo raro em par e o fechamento por pixel.
   - Smoke `refraction`, incluindo o custo.
7. **Remoção do seletor composto** e dos pontos de chamada antigos. Os testes são atualizados.
8. **Fase de carga:**
   - `PipelineState` assíncrono;
   - declaração antecipada;
   - `engineReady` cobrindo os pipelines declarados antes;
   - o substituto das classes não prontas;
   - `pipelineCache?`.
   - Smoke `readiness`.
9. **Deno:**
   - o smoke de compilação;
   - o MSL nativo fora do repositório;
   - com aprovação, a execução do tanque e o vídeo.
10. **Escala (US4):**
    - cena de teste com 1, 3 e 16 grafos: os mesmos kernels de traçado, e o tempo de compilação medido;
    - trocar um grafo recompila só o kernel dele.

Cada fase termina com o gate (lint, tsc, testes) e os smokes afetados, uma execução de GPU por vez.

## Riscos

| Risco                                                                           | Mitigação                                                                                                                    |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Custo dos despachos (refração: cerca de 34 × (3 + M) por quadro) passar de 3 ms | Medir primeiro (fase 1). Reduções em R13. Nunca afrouxar o critério nem cortar o orçamento; se não fechar, levar ao usuário. |
| Memória da onda (registro 64 B + superfície 136 B por raio vivo)                | Capacidade pelos limites do adaptador; processamento em blocos acima dela (R5).                                              |
| Equivalência da refração com a árvore achatada                                  | Os mesmos critérios estatísticos contra a CPU. A diferença do fim e do albedo (máximo achatado) fica documentada.            |
| Precisão f16 do fechamento                                                      | Teste de ida e volta. Se um critério cair por precisão, o fechamento volta a f32 (R2).                                       |
| Compilador da Apple com os kernels novos                                        | O smoke de compilação e o MSL nativo antes de qualquer execução no Deno; kernel com compilação errada não vai à GPU.         |

## Complexity Tracking

Sem violações da constituição.
