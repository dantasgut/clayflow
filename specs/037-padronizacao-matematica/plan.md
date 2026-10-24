# Implementation Plan: Padronização matemática e reuso

**Branch**: `feature/037-padronizacao-matematica` (de `feature/034-refracao-fisica` em `d38416d6`; volta por merge) |
**Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/037-padronizacao-matematica/spec.md` · Levantamento:
[inventory.md](./inventory.md) · Decisões: [research.md](./research.md)

## Summary

1. **Inventário e guarda (US1)**: o inventário das cinco famílias e um teste de assinaturas canônicas que impede a
   volta das duplicatas (R1).
2. **Primitivas (US2)**: duas famílias de hash (aleatoriedade com fluxos nomeados; endereçamento intocado), luminância
   Rec.709 linear única, sRGB com decodificação, YCoCg, constantes, bases e amostragem — as trocas que preservam bits
   primeiro, as que mudam resultado num pacote para decisão do usuário (R2, R8).
3. **Álgebra (US3)**: operações por classe (rígida, afim, projetiva, TRS, 3×3) escolhidas por nome na montagem;
   referência f64 única na CPU; testes de equivalência (R3).
4. **Referencial e espaços (US4)**: inversa de mundo em pool sob demanda; `CameraMatrices` com inversas e vista
   anterior; módulo `view_space`; fim das cópias de câmera anterior da luz global e da névoa; corte em todos os
   históricos (R4).
5. **Acumulador (US5)**: peças temporais comuns e o acumulador genérico de pixel (o filtro do sinal traçado
   generalizado, `TemporalFilter`); antisserrilhado, sondas de tela e névoa usando as peças (R5).
6. **Precisão (US6)**: `historyPrecision` nos Resources donos; tabela 16 × 32 bits; contador do antisserrilhado fora do
   alfa de 16 bits (R6).
7. **Limites (US7)**: smoke `adapterLimits`, `ENGINE_PORTABLE_LIMITS` pelo mínimo comum, piso no `deviceFloor` (R7).
8. **Verificação**: base dos smokes e do bench antes de começar; cada passo com os smokes afetados; fim com tudo três
   vezes no fonte e com `--dist` (R8).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; nenhuma dependência nova

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`, baselines em `bench/baselines/`)

**Testing**: Vitest 4 (`countingCore`): equivalência de cada operação de transformação contra a referência f64
(tolerâncias de R3); assinaturas canônicas; símbolo único; fluxos de aleatoriedade independentes (correlação entre
fluxos no mesmo índice); sequências bit a bit preservadas (valores de controle existentes); `WorldInverse` (só slots
sujos, sob demanda); `CameraMatrices` novas; layouts. Smokes de navegador: todos, contra a base; novo `adapterLimits`;
`bench:check`; `npm run ci`

**Target Platform**: Chrome/Edge com WebGPU; piso Apple M4 (`apple-metal-3`); RTX 4090 (`nvidia-lovelace`) pela outra
máquina

**Project Type**: biblioteca (engine)

**Performance Goals**: nenhuma cena do bench > 10 % de GPU contra o baseline do Mac; ganhos esperados e medidos: a
inversa por pixel do antisserrilhado (uma por quadro), as inversas por acerto/instância (lidas do pool)

**Constraints**: Resource + evento + Flow, sem helpers; C3/C4 só pela C2; cada símbolo WGSL uma vez; nada específico de
Mac ou NVIDIA; famílias bit a bit intactas; mudança de resultado só com medida e decisão do usuário; código de shader
novo só para matemática nova (FR-016); "textura" só para imagem em superfície

**Scale/Scope**: C1 (`GpuContext`: limites portáteis); C2 (nada novo além de contratos já existentes); C3 (módulos de
matemática, `Transform`/`TransformFlow`, `Camera`/`CameraFlow`, GI, névoa, refração, filtro, estrutura de raios, nós,
partículas difusas, colisor); C4 (resolução temporal, água, sprites); smokes; testes; docs

## Constitution Check

| Princípio                       | Avaliação                                                                                                                                         | Status |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Módulos de matemática na C3 (`elements/gpu/wgsl/math`, `elements/math/reference`); C4 os consome pela composição; limites na C1 pelo `GpuContext` | ✅     |
| **II. Domínio na borda**        | `historyPrecision: 'half' \| 'full'`; nomes por classe e domínio; o resto é interno                                                               | ✅     |
| **III. Resource como contrato** | `WorldInverse` e os campos novos de `CameraMatrices` por descritor; `TemporalFilter` com os alvos declarados                                      | ✅     |
| **IV. ECS e Flows**             | `TransformFlow` e `CameraFlow` escrevem o referencial; nenhum helper; consumidores leem pools                                                     | ✅     |
| **V. Testes**                   | Equivalência f64, assinaturas canônicas, sequências bit a bit, smokes contra a base                                                               | ✅     |
| **VI. Documentação**            | Inventário, contrato para autores de extensões, guia `shaders.md` atualizado com a matemática canônica                                            | ✅     |
| **Restrições técnicas**         | Renomeações com a tabela de migração do contrato; os nós mantêm o nome público                                                                    | ✅     |
| **Quality gates**               | `npm run ci` + smokes 3 vezes (fonte e `--dist`) + `bench:check`                                                                                  | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/math-canon.md) não muda o comportamento das famílias bit
a bit; as mudanças de resultado estão listadas e condicionadas à decisão do usuário.

## Project Structure

### Documentation (this feature)

```text
specs/037-padronizacao-matematica/
├── spec.md
├── plan.md
├── inventory.md             # US1: o registro vivo
├── research.md              # R1–R9
├── data-model.md
├── quickstart.md
├── contracts/math-canon.md  # o que o autor de extensões chama
├── checklists/requirements.md
├── baseline-smokes.md       # (implementação) números da base
└── tasks.md                 # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/elements/gpu/wgsl/math/constants.wgsl, random.wgsl, hash_address.wgsl, color.wgsl, basis.wgsl, sampling.wgsl  # primitivas (R2)
src/elements/gpu/wgsl/math/xform_rigid.wgsl, xform_affine.wgsl, xform_projective.wgsl, xform_trs.wgsl, linalg.wgsl   # álgebra (R3)
src/elements/gpu/wgsl/math/view_space.wgsl                                   # espaços (R4)
src/elements/gpu/wgsl/temporal/*.wgsl                                        # peças e acumulador de pixel (R5; hoje denoise/)
src/elements/gpu/shaders/math.ts                                             # módulos e constantes compartilhadas
src/elements/math/reference/xform.ts, random.ts, color.ts (NOVOS)            # referências f64
src/elements/scene/Transform.ts, flows/TransformFlow.ts, kernels/transform_*.wgsl   # WorldInverse (R4)
src/elements/scene/Camera.ts, flows/CameraFlow.ts, kernels/camera_compose*.wgsl    # inversas e vista anterior (R4)
src/elements/lighting/denoise/ → src/elements/lighting/temporal/TemporalFilter.ts   # R5
src/elements/lighting/**/gi_*.wgsl, ProbeFlow.ts; src/elements/media/**             # luz global e névoa nas peças
src/elements/lighting/refraction/**, raytrace/**, nodes/**, diffuse/**, physics/flows/SurfaceColliderFlow.ts
src/presentation/flows/effects/temporal_resolve.wgsl, PostFlow.ts, RefractionDenoiseFlow.ts, water/**
src/core/gpu/GpuContext.ts                                                   # ENGINE_PORTABLE_LIMITS (R7)
src/elements/__tests__/canonicalSignatures.test.ts (NOVO), wgslSymbols.test.ts
src/__smokes__/adapterLimits.ts (NOVO), deviceFloor.ts, support/ (medidas únicas)
clay-engine-doc/docs/guides/shaders.md                                       # matemática canônica
```

**Structure Decision**: biblioteca única; as primitivas e a álgebra na C3 como módulos WGSL compostos por `requires`
(e por ponto de extensão onde a classe varia por cena); o referencial nos pools escritos pelos Flows existentes; o
acumulador de pixel como Resource da C3 (`TemporalFilter`) com a fonte por ponto de extensão; limites na C1.

## Complexity Tracking

Nenhuma violação da constituição.
