# Implementation Plan: Pontos de extensão matemáticos

**Branch**: `feature/009-math-extension-points` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-math-extension-points/spec.md` · Roadmap:
[`specs/ROADMAP.md`](../ROADMAP.md) (F3, §4.3, §4.4 N2) · Baseline: o regravado na 030

## Summary

Os sete pontos do ROADMAP §4.3 como funções WGSL do usuário, compostas e validadas pelo núcleo:

1. **Mecanismo (C2)**: `WgslPoint` + `bindPoints` trocam o módulo pronto de um ponto pelo do usuário sem mudar o
   `composeWgsl` (R1); `ExtensionFunction` é o Resource da função, com parâmetros por schema gerado (R2); troca em
   execução por compilação assíncrona e evento `extensionRejected` (R3), com o apoio da C1 para as mensagens do
   compilador.
2. **Pontos de cena (C3)**: `transform` por grupos de função no `TransformFlow` (R4); `camera` por câmera, com
   projeção de ponto opcional no forward (R5).
3. **Física (C3)**: `field_accel` somado à gravidade nos seis solvers, com os campos prontos consumidos por um pool
   comum (R6); `EmitterFlow` para o `ComputeParticleEmitter` (R7).
4. **Geometria e aparência (C3)**: `ParametricSurface` + `SurfaceFlow` na GPU (R8), `space` sobre ela (R9),
   `material_eval` no forward (R10).
5. **Verificação**: smoke `extensionPoints`, fixtures existentes intactas, variante de bench, vídeos (R12).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem dependências novas

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (`countingCore`): `bindPoints`/validação de assinatura/conflitos, `ExtensionFunction` (schema
gerado, hash), composição por ponto, grupos do `TransformFlow`, transições de troca e rejeição, acumulador do emissor,
grade da superfície; smokes de navegador (inclusive `--dist`): `extensionPoints` (novo) e todos os existentes sem
regravar; `bench:check`; `npm run ci`

**Target Platform**: Chrome/Edge com WebGPU (perfil de referência Apple Metal 3)

**Project Type**: biblioteca (engine)

**Performance Goals**: nenhuma regressão no `bench:check`; SC-008 (10 funções em 10 k objetos ≤ 1,10 × a CPU sem
funções)

**Constraints**: sem helpers (Resource + evento + Flow); dispatch só grava; nenhuma leitura de volta; fixtures bit a
bit sem funções; um símbolo WGSL por pipeline; C3/C4 importam só a C2; sem ciclos (`check:circular`)

**Scale/Scope**: C1 (`shaderMessages`, rejeição do `createAsync`); C2 (`WgslPoint`, `bindPoints`, `ranges`,
`ExtensionFunction`, evento); C3 (sete classes de função, `TransformFlow`, `CameraFlow`, `ForwardFlow`/`forward.wgsl`,
seis solvers + kernels, `ForceField`s, `EmitterFlow`, `ParametricSurface`/`SurfaceFlow`); smoke; bench; docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                           | Status |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | C1 só ganha diagnóstico de shader (contrato + implementação), reexportado pela C2; mecanismo genérico na C2; pontos concretos na C3; C4 intocada    | ✅     |
| **II. Domínio na borda**        | Autoria por funções nomeadas por ponto e parâmetros por nome; layout gerado do schema; tipos de GPU só no núcleo                                    | ✅     |
| **III. Resource como contrato** | A função é um Resource (`ExtensionFunction`) com dado de GPU (parâmetros) por descritor; campos no pool comum                                       | ✅     |
| **IV. ECS e Flows**             | Troca e rejeição por evento e tabela de transições dos Flows donos; grupos por função como os grupos de desenho; nenhuma decisão em `dispatch`      | ✅     |
| **V. Testes**                   | CPU para composição, validação, grupos, transições; GPU por smoke com medidas e fixtures, inclusive no dist; fixtures existentes intactas           | ✅     |
| **VI. Documentação**            | Arquitetura (pontos, composição, troca, erros), guia de shaders (sai "fora desta versão"), guia de física (campos), ROADMAP, PENDENCIAS, JSDoc, API | ✅     |
| **Restrições técnicas**         | Sem deps; API só com acréscimos; o caminho sem funções é o atual                                                                                    | ✅     |
| **Quality gates**               | `npm run ci` (ordem do workflow)                                                                                                                    | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/extension-points.md) fixa assinaturas e a regra de
composição; o único toque na C1 é diagnóstico, sem objeto de GPU atravessando a fronteira.

## Project Structure

### Documentation (this feature)

```text
specs/009-math-extension-points/
├── plan.md
├── research.md          # Achados A1–A11, decisões R1–R12
├── data-model.md
├── quickstart.md
├── contracts/extension-points.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/core/contracts/EngineCore.ts, core/gpu/GpuEngineCore.ts   # shaderMessages; createAsync rejeita com a mensagem
src/scene/
├── shaders/WgslPoint.ts (NOVO), bindPoints.ts (NOVO), composeWgsl.ts (ranges)
├── contracts/ExtensionFunction.ts (NOVO), contracts/gpu (reexport ShaderMessage)
├── events/EventMap.ts                                         # extensionRejected
└── systems/flowBinding/PipelineState.ts                       # troca só após compilar; rejeição
src/elements/
├── extension/ (NOVO)  TransformFunction, CameraFunction, SurfaceFunction, SpaceFunction, FieldFunction,
│                       MaterialFunction, EmitFunction; pontos (WgslPoint) e prontas
├── scene/flows/TransformFlow.ts, CameraFlow.ts, shaders.ts    # grupos por função; tempo; camera_fn
├── material/ForwardFlow*, gpu/wgsl/forward.wgsl, material/shaders.ts   # material_eval, camera_project, uv
├── physics/forcefields/*.ts                                   # registro ForceFieldRecord
├── physics/flows/{LCP,XPBD,FEM,MPM,SPH,PBF}Flow.ts + kernels  # field_accel
├── particles/EmitterFlow.ts (NOVO), gpu/wgsl/kernels/emit_*.wgsl (NOVOS)
├── geometry/ParametricSurface.ts (NOVO), geometry/SurfaceFlow.ts (NOVO), gpu/wgsl/kernels/surface_*.wgsl (NOVOS)
src/__smokes__/extensionPoints.ts (NOVO) + support
bench/scenes/instances/*                                       # variante 10k-functions
clay-engine-doc/docs/guides/ (arquitetura, shaders, física), specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; mecanismo genérico na C2, pontos e estágios na C3 (pasta nova
`elements/extension` para as funções; os Flows ficam no domínio de cada estágio).

## Fases de implementação (para `/speckit-tasks`)

1. **Base**: números de partida do bench; smoke `extensionPoints` com os casos vazios e medidas; ROADMAP com 030 e
   PR #43 integrados.
2. **Fundação (C1/C2)**: `shaderMessages`, rejeição do `createAsync`, `ranges`; `WgslPoint`, `bindPoints`,
   validação; `ExtensionFunction` (schema e pool de parâmetros); `extensionRejected`; troca só após compilar no
   `PipelineState`; testes de CPU; fixtures intactas.
3. **US1 transform + camera**: pontos e prontas; `TransformFlow` com grupos e tempo; `CameraFlow` com `camera_fn`;
   forward com `camera_project`; casos órbita e olho de peixe; variante de bench.
4. **US2 field + emit**: `ForceFieldRecord`; `field_accel` nos seis solvers; prontos vento/vórtice/arrasto/empuxo/
   gravidade pontual; `FieldFunction`; `EmitterFlow` e prontas; casos de campos e emissores.
5. **US3 surface + space + material**: `ParametricSurface`, `SurfaceFlow`, prontas; `SpaceFunction` no
   `SurfaceFlow`; `material_eval` e `uv` no forward; `MaterialFunction` na chave do pipeline; casos.
6. **US4 troca e erros**: troca em execução por ponto; rejeições (assinatura, símbolo, compilação); 30/60/144 Hz.
7. **Docs**: arquitetura, guias, PENDENCIAS, JSDoc, API.
8. **Fechamento**: smokes (fonte e `--dist`), `bench:check`, `npm run ci`, baseline regravado, vídeos.

## Complexity Tracking

| Ponto                                      | Por que é necessário                                                             | Alternativa mais simples rejeitada                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Toque na C1 (diagnóstico de shader)        | Sem as mensagens do compilador não há erro útil nem troca segura                 | Erro genérico do device — sem linha e derruba o escopo de validação          |
| Grupos por função no `TransformFlow`       | Funções diferentes exigem pipelines diferentes; custo por função, não por objeto | Um `switch` por id de função num kernel único — recompila tudo a cada função |
| Gravidade uniforme + `field_accel` somado  | Mantém as trajetórias bit a bit e põe todos os campos no mesmo caminho           | Gravidade só pelo laço de campos — ordem de soma diferente muda bits         |
| Emissor e superfície na GPU nesta spec     | Os pontos `emit`, `surface` e `space` não têm onde rodar sem eles                | Só a assinatura, sem estágio — ponto sem teste nem uso                       |
| Projeção de ponto como variante do forward | Projeções não lineares não cabem numa matriz                                     | Pós-processo de distorção da imagem — perde resolução e não é uma câmera     |
