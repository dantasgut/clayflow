# Implementation Plan: Coesão e adesão de fluidos

**Branch**: `feature/030-fluid-cohesion-adhesion` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/030-fluid-cohesion-adhesion/spec.md` · Roadmap:
[`specs/ROADMAP.md`](../ROADMAP.md) (F5; 030 fora da sequência, como a 029) · Pendências:
[`specs/PENDENCIAS.md`](../PENDENCIAS.md) (viscosidade do MPM, F5/016) · Baseline: o regravado na 017

## Summary

Tensão superficial e adesão nos fluidos de partículas, controladas pelo material, toda na GPU:

1. **Material (C3)**: `ParticleMaterial` ganha `cohesion`, `adhesion` e `xsph` (R8), com escalas adimensionais (R2, R3)
   e passo estável capilar/viscoso (R6).
2. **Coesão (C3)**: Akinci 2013 — coesão + curvatura com correção K_ij (R1). SPH: passe novo de normais + termo nas
   forças; PBF: normais e densidade no passe de vorticidade + termo no XSPH (R4).
3. **Adesão (C3)**: integral de meio-espaço do núcleo de adesão sobre a fronteira genérica `ColliderHit` (domínio e
   colliders), na colisão do SPH e na predição do PBF (R3, R4).
4. **MPM (C3)**: tensão viscosa newtoniana pela matriz afim do APIC (R7).
5. **Verificação**: smoke `fluidBehavior` com medidas numéricas (R9); fixtures existentes idênticas, exceto MPM fluido;
   variantes `*-cohesion` no bench (R10); vídeos (R11).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem dependências novas

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (`countingCore`) para o material (validação, escalas, passo estável, grampeamento), parâmetros
escritos pelos Flows, passes gravados com e sem coesão; smokes de navegador (inclusive `--dist`): `fluidBehavior`
(novo), `particles`, `trajectories`, `fluidSurface`, `render`, `softSurface`, `pointCloud`; `npm run bench`,
`bench:check`

**Target Platform**: Chrome/Edge com WebGPU (perfil de referência Apple Metal 3)

**Project Type**: biblioteca (engine)

**Performance Goals**: SC-009 — simulação com coesão e adesão ≤ 1,25 × sem elas em 64k partículas; nenhuma regressão
no `bench:check`

**Constraints**: sem helpers; dispatch só grava; nenhuma leitura de volta; trajetórias bit a bit com os padrões;
símbolos WGSL definidos uma vez; nomes explícitos (minificação); C1 inalterada

**Scale/Scope**: C3 — `ParticleMaterial`, `simParams.ts`, `SPHFlow`, `PBFFlow`, `MPMFlow`, shaders `sph.ts`/`pbf.ts`,
kernels `sph_normals` (novo), `sph_forces`, `sph_collision`, `pbf_predict`, `pbf_vorticity`, `pbf_xsph`, `mpm_p2g`,
`math/sph_kernels.wgsl`, `math/collider_set.wgsl`; smoke; bench; docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                | Status |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------ |
| **I. Camadas e importação**     | Tudo na C3 (material, solvers, kernels); C1, C2 e C4 intocadas                                                           | ✅     |
| **II. Domínio na borda**        | Autoria em vocabulário de domínio (coesão, adesão, suavização) e adimensional; γ/β em unidades do solver ficam no núcleo | ✅     |
| **III. Resource como contrato** | Parâmetros vivem no Resource `ParticleMaterial`; buffers de normais são recursos privados dos Flows, como a vizinhança   | ✅     |
| **IV. ECS e Flows**             | Valores copiados em `framePrepare`; passes gravados no `dispatch`; nenhuma decisão nova fora das transições              | ✅     |
| **V. Testes**                   | CPU para material/parâmetros/passes; GPU por smoke com medidas e fixtures, inclusive no dist                             | ✅     |
| **VI. Documentação**            | Arquitetura (fronteira genérica), guia de materiais de partículas, ROADMAP, PENDENCIAS, JSDoc, API                       | ✅     |
| **Restrições técnicas**         | Sem deps; mudança de API compatível (só acréscimos; padrões preservam o comportamento)                                   | ✅     |
| **Quality gates**               | Ordem do CI inalterada                                                                                                   | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/fluid-surface-forces.md) apoia a adesão só em
`ColliderHit` (distância + normal), o ponto que a 015/016 estende; nenhuma camada além da C3 muda.

## Project Structure

### Documentation (this feature)

```text
specs/030-fluid-cohesion-adhesion/
├── plan.md
├── research.md          # Achados A1–A9, decisões R1–R11
├── data-model.md
├── quickstart.md
├── contracts/fluid-surface-forces.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/elements/
├── physics/materials/ParticleMaterial.ts     # cohesion, adhesion, xsph; escalas; passo estável; grampeamento
├── physics/schemas/simParams.ts              # campos novos de SPH/PBF
├── physics/flows/SPHFlow.ts                  # sph_normal; passe de normais; parâmetros; aviso
├── physics/flows/PBFFlow.ts                  # pbf_normal; colliders na predição; parâmetros; aviso
├── physics/flows/MPMFlow.ts                  # passo estável viscoso
├── physics/shaders/sph.ts, pbf.ts            # módulo sph_normals; dependências novas
└── gpu/wgsl/
    ├── math/sph_kernels.wgsl                 # C e A de Akinci
    ├── math/collider_set.wgsl                # collider_set_adhesion
    └── kernels/sph_normals.wgsl (NOVO), sph_forces, sph_collision, pbf_predict, pbf_vorticity, pbf_xsph, mpm_p2g
src/__smokes__/fluidBehavior.ts               # NOVO
bench/scenes/particles/{scene,clayflow,three}.ts   # variantes *-cohesion
clay-engine-doc/docs/guides/                        # arquitetura, materiais de partículas
specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; a mudança fica inteira na C3, sobre o `ColliderHit` existente.

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: números de partida (`particles/4k`, `64k` GPU) e lista de fixtures afetadas pelo MPM (A9); cena de teste
   do smoke (`fluidBehavior` com os casos vazios e as medidas).
2. **Fundação**: campos do material, validação, escalas, passo estável e grampeamento; campos dos `*SimParams`; XSPH do
   material; testes de CPU; fixtures existentes idênticas.
3. **US1 coesão**: núcleos de Akinci; SPH (passe de normais, forças); PBF (vorticidade, XSPH); casos gota/filete/barragem
   nos dois solvers.
4. **US2 adesão**: `collider_set_adhesion`; SPH (colisão), PBF (predição com colliders); casos menisco/placa
   inclinada/gota na placa.
5. **US3 material**: MPM viscoso e passo estável; casos MPM e suavização; fixtures do MPM fluido regravadas.
6. **US4**: troca em execução; 30/60/144 Hz; variantes `*-cohesion` no bench; SC-009.
7. **Docs**: arquitetura, guia, ROADMAP (030 na F5), PENDENCIAS (viscosidade do MPM resolvida), JSDoc, API.
8. **Fechamento**: smokes (fonte e `--dist`), `bench:check`, gate completo, baseline regravado; vídeos.

## Complexity Tracking

| Ponto                                  | Por que é necessário                                                          | Alternativa mais simples rejeitada                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Passe/buffer de normais                | A curvatura lê a normal dos vizinhos; escrever no próprio struct cria corrida | Normal só da própria partícula — sem o termo de curvatura, a borda aglomera (Akinci)   |
| Integral de meio-espaço por quadratura | Adesão sobre fronteira contínua sem partículas de fronteira                   | Partículas de fronteira por collider — custo e geometria duplicados com a 015/016      |
| Colliders na predição do PBF           | A colisão roda N vezes por iteração; a adesão deve agir uma vez               | Adesão na colisão — aplicada N vezes, dependente de `solverIters`                      |
| Passo capilar com teto e grampeamento  | Coesão alta explode sem passo menor; sem teto, substeps ilimitados travam     | Só grampear — perde precisão onde ainda cabe; só substeps — trava com valores extremos |
