# Implementation Plan: Transformações reativas

**Branch**: `feature/003-reactive-transforms` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-reactive-transforms/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md)
(F0 — implementada antes da spec 002)

## Summary

Restaurar, no lugar arquitetural certo, o mecanismo que a refundação previa para transformações:

1. **Dado reativo** (C2): o `ResourceSystem` instala um proxy em `data` na alocação; mutações viram `resourceDirty`
   automaticamente, enfileiradas e enviadas uma vez por quadro no novo evento `frameRecording`.
2. **Política de envio por descritor** (`upload: 'always' | 'initial' | 'never'`), realizando o estado `GpuManaged`
   do desenho — a GPU é dona dos corpos simulados e dos produtos de estágios.
3. **`Transform` só intenção** (posição, rotação, escala); a matriz sai do `data` e vira um segundo descritor do
   mesmo recurso, `WorldTransform`, produzido só pela GPU, no mesmo slot.
4. **`TransformFlow`** (C3) numa nova fase `transform`: compute que compõe `T·R·S` e a matriz de normais, despachado
   só quando algo mudou; substituível (base de `Parent`, ponto de extensão `transform` e cadeias não euclidianas).
5. **Forward e sombra** leem `WorldTransform` por slot via `instance_index`; acabam o buffer e o envio de transform
   por objeto por quadro; normais corretas; culling correto com escala negativa.
6. **Física** publica só a pose pelo mecanismo reativo, sem matriz e sem acesso privado.

Decisões e alternativas em [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem novas dependências (runtime `uuid` apenas)

**Storage**: N/A (buffers GPU geridos pelo `ResourceSystem`)

**Testing**: Vitest 4 (happy-dom) para toda lógica CPU-side; smoke de navegador novo (`src/__smokes__/transforms.ts`)
para a verdade da GPU (readback + pixels), mais os smokes existentes

**Target Platform**: Chrome/Edge com WebGPU (referência: macOS/Metal)

**Project Type**: biblioteca (engine)

**Performance Goals**: cena estática com 10k objetos sem nenhum envio de transform por objeto por quadro e sem dispatch
do estágio quando nada muda (SC-005); nenhuma cena existente piora

**Constraints**: sem helpers fora do mecanismo (recurso + evento + estágio); ordem por fase declarada; C3/C4 dependem de
contratos (`PoolDirectory`) e não de `ResourceSystem` no código novo

**Scale/Scope**: ~12 arquivos da lib alterados (C2: `ResourceSystem`, `GPUDescriptor`, `EventMap`, `ExecutionSystem`,
`Flow`/`FlowRegistry`, contrato novo; C3: `Transform`, bodies, `LCPFlow`, `TransformFlow` novo + WGSL; C4: forward,
sombra, defaults, shaders), ~10 arquivos de teste, 1 smoke, 4 guias + README

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                                                                                                                                                                                                                                                                                              | Status |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Mecanismo reativo e fila em C2 (`scene/systems`); contrato `PoolDirectory` em `scene/contracts`; `TransformFlow` (C3) e as partes novas de forward/sombra (C4) dependem só de contratos (`core/contracts`, `scene/contracts`, `scene/events`, `scene/descriptors`). Nada importa `core/gpu`. Imports legados de `ResourceSystem` nos Flows de física permanecem (dívida registrada na decisão D4 do roadmap, spec 006) e não aumentam. | ✅     |
| **II. Domínio na borda**        | API de autoria segue em vocabulário de domínio (`position`, `rotation`, `scale`); matriz e slot não aparecem na autoria. `upload` é declaração de descritor (núcleo), não de autoria.                                                                                                                                                                                                                                                  | ✅     |
| **III. Resource como contrato** | A matriz de mundo é descritor do recurso `Transform` (pool `WorldTransform`), alocada pelo `ResourceSystem`; o estágio não cria buffers de dado por conta própria. Envio/atualização só via `ResourceSystem`.                                                                                                                                                                                                                          | ✅     |
| **IV. ECS e Flows**             | Novo estágio é um `Flow`; ordem **explícita** por fase nova `transform`; envio dos sujos antes do record por evento explícito `frameRecording` (não por ordem de inscrição).                                                                                                                                                                                                                                                           | ✅     |
| **V. Testes**                   | Toda lógica determinística nova com Vitest (proxy, fila, política, slots, fases, estágio, consumidores com mocks); GPU validada por smoke com readback e pixels. Gate verde antes de concluir.                                                                                                                                                                                                                                         | ✅     |
| **VI. Documentação**            | README, `getting_started`, guia de migração (mudança incompatível) e guia de arquitetura corrigidos; JSDoc em todos os exports novos/alterados; `onBrokenLinks: 'throw'` respeitado.                                                                                                                                                                                                                                                   | ✅     |
| **Restrições técnicas**         | Backend substituível preservado (nada novo em `core/gpu`); sem deps novas. Mudança incompatível (`model`) aceitável em 0.x, documentada.                                                                                                                                                                                                                                                                                               | ✅     |
| **Quality gates**               | Ordem do CI inalterada.                                                                                                                                                                                                                                                                                                                                                                                                                | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — os contratos ([reactive-data.md](./contracts/reactive-data.md),
[transform-stage.md](./contracts/transform-stage.md)) mantêm C1 como única fronteira com o hardware e o
`ResourceSystem` como único dono de dado GPU.

## Project Structure

### Documentation (this feature)

```text
specs/003-reactive-transforms/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões R1–R10
├── data-model.md        # Fase 1 — Transform, WorldTransform, slots, política, fila, eventos, estágio
├── quickstart.md        # Fase 1 — uso, migração, validação
├── contracts/
│   ├── reactive-data.md     # dado reativo, política upload, frameRecording, PoolDirectory
│   └── transform-stage.md   # Transform, TransformFlow, contrato de consumo WGSL/TS, física
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── scene/                                   # C2
│   ├── contracts/PoolDirectory.ts           # NOVO — contrato de leitura de pools (R7)
│   ├── descriptors/GPUDescriptor.ts         # + upload?: 'always' | 'initial' | 'never' (R3)
│   ├── events/EventMap.ts                   # + frameRecording: FrameRecordingEvent (R2)
│   ├── events/FrameRecordingEvent.ts        # NOVO
│   ├── flows/Flow.ts                        # Phase + 'transform'
│   ├── flows/FlowRegistry.ts                # PHASE_ORDER com 'transform' entre physics e shadow
│   ├── systems/ExecutionSystem.ts           # emite frameRecording antes de core.record
│   ├── systems/ResourceSystem.ts            # proxy na alocação, fila de sujos, política upload,
│   │                                        #   slot por recurso entre pools, implements PoolDirectory
│   ├── systems/reactiveData.ts              # NOVO — proxy profundo (lógica pura, testável)
│   └── __tests__/                           # reactiveData, dirtyQueue, uploadPolicy, poolSlots, phases
├── elements/                                # C3
│   ├── scene/Transform.ts                   # schema intenção + worldSchema; sem model; aviso
│   ├── scene/flows/TransformFlow.ts         # NOVO — estágio compute
│   ├── scene/__tests__/                     # Transform, TransformFlow
│   ├── gpu/wgsl/structs/transform.wgsl      # NOVO — struct Transform (intenção)
│   ├── gpu/wgsl/structs/world_transform.wgsl # NOVO — struct WorldTransform
│   ├── gpu/wgsl/kernels/transform_compose.wgsl # NOVO — T·R·S + R·S⁻¹
│   ├── physics/bodies/{RigidBody,SoftBody,FluidBody}.ts # upload: 'initial'
│   └── physics/flows/LCPFlow.ts             # publica pose; sem matriz; sem cast; instanceof
├── presentation/                            # C4
│   ├── flows/ForwardFlow.ts                 # bind group WorldTransform; firstInstance; frontFace
│   ├── flows/ShadowFlow.ts                  # idem
│   ├── flows/shadow_depth.wgsl              # storage array + instance_index
│   ├── flows/defaults.ts                    # registra TransformFlow
│   └── flows/__tests__/                     # forward/shadow com passes mockados
├── elements/gpu/wgsl/forward.wgsl           # storage array + instance_index + normal matrix
└── __smokes__/transforms.ts                 # NOVO — readback, pixels, mutação, física

clay-engine-doc/docs/guides/{getting_started,migration_legacy_to_clean,architecture_resource_loaders}.md
README.md
```

**Structure Decision**: biblioteca única existente em 4 camadas; o mecanismo genérico fica em C2, o estágio ao lado do
recurso que ele transforma (C3), e os consumidores em C4.

## Fases de implementação (para /speckit-tasks)

1. **Fundacional C2** — `reactiveData` (proxy) com testes; `upload` no descritor; fila + `frameRecording`; slot por
   recurso entre pools; `PoolDirectory`; fase `transform`. Bloqueia tudo.
2. **US1 (P1) — posicionar** — `Transform` intenção + `worldSchema`; WGSL; `TransformFlow`; forward e sombra por slot
   com normal matrix e `frontFace`; registro em defaults; smoke (readback + pixels).
3. **US2 (P2) — mutação sem chamadas** — validação ponta a ponta da reatividade em transformações e em outro recurso
   (material); smoke de mutação no quadro seguinte; teste de coalescência integrado.
4. **US3 (P3) — física publica pose** — `upload: 'initial'` nos bodies; `LCPFlow` publica pose; escala preservada;
   smoke de corpos rígidos.
5. **Polish** — README, guias, JSDoc/TypeDoc, verificação SC-005 (cena estática de 10k sem envios por objeto e sem
   dispatch), smokes existentes, gate completo.

## Complexity Tracking

Sem violações constitucionais. Mudança incompatível (`Transform.model` removido) justificada em research R4: manter o
campo perpetuaria o defeito e impediria o estágio em GPU; versão 0.x, aviso em runtime e guia de migração.
