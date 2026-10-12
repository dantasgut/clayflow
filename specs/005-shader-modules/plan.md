# Implementation Plan: Núcleo de shaders

**Branch**: `feature/005-shader-modules` | **Date**: 2026-10-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-shader-modules/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md)
(F1, item 005; §4.2; decisão D5) · Linha de base: `bench/baselines/` (regravada na 004, commit `b17d5d6`)

## Summary

Substituir a colagem de texto de WGSL por um núcleo de shaders conforme a refundação, sem mudar simulação nem imagem:

1. **Módulos (C2)**: `wgslModule({ name, source, requires, structs })` imutável, dependências por referência;
   `composeWgsl(entry)` com ordem topológica determinística, inclusão única, detecção de ciclo, nome repetido,
   símbolo conflitante e marcador de struct inválido; resultado memorizado como o mesmo `ShaderModuleSpec` (hash da
   004 calculado uma vez). `createComputeKernel` e `PipelineDescriptor` passam a receber `WgslModule` — nenhum estágio
   entrega texto montado à mão.
2. **Structs gerados (C2)**: `StructSchema` com `wgslName`, `addressSpace` (`storage`/`uniform`), arrays, structs
   aninhados, atômicos, array em execução, `toWGSL()` válido e `packInto`; `u16`/`i16` removidos. Todos os 22 arquivos
   de struct e os structs de render/kernel duplicados saem; todo dado interno ganha schema; `PerStepUniforms` passa a
   escrever por schema; nenhum offset numérico à mão.
3. **Matemática (C3)**: `wgslLib` com 12 módulos de base (`quat`, `linalg`, `mat`, `sdf`, `sph_kernels`, `mpm_weights`,
   `xpbd`, `lcp`, `fem`, `noise`, `color`, `brdf`); cada função num único arquivo (verificado no gate).
4. **Kernels genéricos (C3)**: `PrefixSum`, `RadixSort`, `Compaction`, `Reduce`, `GraphColorer` e os módulos
   `fixed_point`/`atomic_alloc`; a busca de vizinhança usa `PrefixSum` e o LCP usa `atomic_alloc` e `fixed_point`.
5. **Legado**: matemática dos 23 órfãos extraída para módulos; cascas de kernel removidas; inventário por arquivo.
6. **Documento de arquitetura**: as 10 inconsistências da D5 com definição única (estado atual × alvo marcados), seção
   de shaders reescrita; duas correções de código que o documento exige (`resolve` por prioridade, `Scene.add`
   inserindo no World).
7. **Física que nunca rodou** (research A7/A8, R17/R18): `ColliderSet` compartilhado (LCP e fluidos), colisão de
   SPH/PBF/MPM contra os pools tipados, XPBD padrão ligado às restrições; fluidos coerentes por `ParticleMaterial`
   (massa, suavização, grade e passo estável derivados), PBF com massa, SPH no suporte do núcleo, MPM com material de
   fluido e fachadas com F = I — antes de gravar as fixtures.
8. **Verificação**: fixtures de trajetória e de imagem gravadas **antes** de mexer em WGSL; smokes novos
   `trajectories`, `render`, `shaderLibrary`, `computeKernels`; gate e `bench:check` sem regressão.

Decisões e alternativas em [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU; sem novas dependências de runtime

**Storage**: N/A (fixtures binárias de trajetória e de imagem versionadas em `src/__smokes__/fixtures/`)

**Testing**: Vitest 4 (happy-dom) para montagem, varredor de símbolos, layout/`toWGSL`/`packInto`, schemas novos,
inventário e duplicação de WGSL, valores de referência em CPU (`noise`, `fixed_point`); smokes de navegador pelo
servidor do bench (inclusive `--dist`) para compilação de todos os módulos, valores de referência na GPU, kernels
genéricos contra CPU, trajetórias e imagem; `npm run bench:check`

**Target Platform**: Chrome/Edge com WebGPU (referência: perfil `apple-metal-3-chrome154-macos-1280x720-syhprh`)

**Project Type**: biblioteca (engine)

**Performance Goals**: nenhuma regressão > 10% no `bench:check`; `limits` e `rigidContacts` com tempo por quadro não
pior que na 004 (8,2 ms / 223,7 ms); ordenação de 4 M pares e scan de 4 M elementos dentro de um quadro de 16 ms no
perfil de referência (registrado, não gate)

**Constraints**: sem helpers; C3/C4 só por contratos de `scene/`; C1 inalterada (só `ShaderModuleSpec.source`);
trajetória bit a bit (SPH/PBF: tolerância = envelope medido entre execuções, R14); imagem idêntica; montagem só na
criação; build minificado sem dependência de nomes de classe

**Scale/Scope**: C2 — `scene/shaders/` novo (~4 arquivos), `StructSchema`/`FieldType`, `createComputeKernel`,
`PipelineDescriptor`, `FlowRegistry.resolve`, `Scene.add`; C3 — `elements/gpu/shaders/` (12 módulos + 2 de suporte),
`elements/gpu/compute/` (5 kernels genéricos), ~25 schemas novos, 6 Flows de física + `TransformFlow` +
`NeighborSearchPipeline` + materiais migrados, ~50 `.wgsl` ajustados (structs removidos, `requires` declarados), 23
órfãos tratados; C4 — forward/sombra/pós/UI migrados para módulos e schemas; ~20 arquivos de teste, 4 smokes novos,
documento de arquitetura, guias e ROADMAP

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                                                                                                  | Status |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **I. Camadas e importação**     | Montagem e geração de structs em C2 (`scene/shaders`, `scene/descriptors`); biblioteca e kernels genéricos em C3; C4 usa por `scene/` e `elements/`. C1 continua recebendo só `ShaderModuleSpec`. Nada novo importa `core/gpu` fora de C1. | ✅     |
| **II. Domínio na borda**        | Nada disso aparece na fachada N0: módulos, schemas de parâmetro e kernels genéricos são do núcleo. A API de autoria de corpos/materiais não muda.                                                                                          | ✅     |
| **III. Resource como contrato** | O schema passa a ser a fonte única do layout de todo dado de GPU (inclusive parâmetros e estado interno), como o princípio exige ("dados declarados via descriptor com `Schema`").                                                         | ✅     |
| **IV. ECS e Flows**             | Flows continuam roteados por schema; a ordem de Flows passa a seguir a regra explícita (fase → prioridade → registro) também no `resolve`.                                                                                                 | ✅     |
| **V. Testes**                   | Testes CPU para montagem, varredor, layout, schemas e referências; GPU por smokes (biblioteca, kernels, trajetória, imagem), inclusive sobre o dist; a coloração de grafo (citada no princípio) é validada por propriedade.                | ✅     |
| **VI. Documentação**            | Documento de arquitetura corrigido (D5) e com o núcleo de shaders; JSDoc em todos os exports novos; guias de shaders e migração; API regenerada.                                                                                           | ✅     |
| **Restrições técnicas**         | Sem deps novas; backend substituível preservado; mudanças incompatíveis (0.x) listadas no quickstart e no guia de migração.                                                                                                                | ✅     |
| **Quality gates**               | Ordem do CI inalterada; duas verificações novas rodam dentro de `test:coverage` (inventário e duplicação de WGSL).                                                                                                                         | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — os contratos ([shader-modules.md](./contracts/shader-modules.md),
[struct-schema.md](./contracts/struct-schema.md), [compute-kernels.md](./contracts/compute-kernels.md)) mantêm C1
sem conhecimento de módulos, colocam a composição na C2 consumida por contrato e não introduzem estado global
(módulos por referência, sem registro). A remoção do `GraphColorSolver` em CPU e de `FieldType.u16/i16` são
mudanças incompatíveis justificadas em R4/R12.

## Project Structure

### Documentation (this feature)

```text
specs/005-shader-modules/
├── plan.md              # Este arquivo
├── research.md          # Achados A1–A6, decisões R1–R16
├── data-model.md        # WgslModule, ComposedShader, StructSchema, schemas internos, kernels genéricos, inventário
├── quickstart.md        # uso, validação, migração
├── inventory.md         # Fase de implementação — decisão por arquivo do legado (23) + auditoria CPU (FR-017)
├── contracts/
│   ├── shader-modules.md  # wgslModule, composeWgsl, consumo pelos estágios, wgslLib, verificações
│   ├── struct-schema.md   # StructSchema, marcadores, PerStepUniforms, leitura de volta
│   └── compute-kernels.md # PrefixSum, RadixSort, Compaction, Reduce, GraphColorer, módulos de suporte
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── scene/                                     # C2
│   ├── shaders/                               # NOVO
│   │   ├── WgslModule.ts                      # wgslModule(), WgslModule, WgslSymbol
│   │   ├── scanWgslSymbols.ts                 # varredor léxico de nível superior
│   │   ├── composeWgsl.ts                     # montagem, memo, erros, verificação de referências
│   │   ├── WgslCompositionError.ts
│   │   └── index.ts
│   ├── descriptors/FieldType.ts               # − u16/i16; + atomicU32/I32; array/struct/runtimeArray
│   ├── descriptors/StructSchema.ts            # wgslName, addressSpace, layout por regra, toWGSL, packInto
│   ├── descriptors/PipelineDescriptor.ts      # shader: WgslModule
│   ├── flows/createComputeKernel.ts           # shader: WgslModule; entryPoint verificado
│   ├── flows/validateWgslReferences.ts        # sobre o resultado montado (ou absorvido por composeWgsl)
│   ├── flows/FlowRegistry.ts                  # resolve por priority
│   └── __tests__/                             # composeWgsl, scanner, StructSchema layout/toWGSL/packInto
├── core/gpu/GpuEngineCore.ts                  # − compute() (cópia de createComputeKernel)
├── elements/                                  # C3
│   ├── gpu/shaders/                           # NOVO — wgslLib: 12 módulos + fixed_point + atomic_alloc + reduceOp
│   ├── gpu/compute/                           # NOVO — PrefixSum, RadixSort, Compaction, Reduce, GraphColorer (+ .wgsl)
│   ├── gpu/wgsl/math/                         # fontes dos módulos (linalg/fem novos a partir dos órfãos)
│   ├── gpu/wgsl/kernels/                      # kernels de estágio sem structs colados; órfãos removidos
│   ├── gpu/wgsl/structs/                      # REMOVIDO
│   ├── gpu/NeighborSearchPipeline.ts          # PrefixSum; NsSimParamsSchema
│   ├── gpu/GraphColorSolver.ts                # REMOVIDO
│   ├── physics/schemas/params/                # NOVO — schemas de parâmetros e estado interno
│   ├── physics/shaders/                       # NOVO — módulos de entrada dos Flows de física
│   ├── physics/flows/*.ts                     # módulos, schemas, PerStepUniforms por schema
│   ├── physics/bodies/schemas/*.ts            # wgslName
│   ├── scene/Scene.ts                         # add insere no World
│   ├── scene/flows/TransformFlow.ts           # módulo + TransformParamsSchema
│   ├── material/*.ts                          # módulo forward
│   └── __tests__/                             # schemas internos, wgslInventory, wgslSymbols, referências CPU
├── presentation/                              # C4
│   ├── flows/{Forward,Shadow,Post,UI}Flow.ts  # módulos + schemas (ForwardShadowParams, ShadowDepthParams, EffectParams)
│   ├── flows/effects/PostProcessEffect.ts     # efeito personalizado como módulo
│   └── ui/UiGpuPipeline.ts                    # ScreenParams/UiQuad por schema
└── __smokes__/
    ├── trajectories.ts                        # NOVO — grava/compara fixture (R14)
    ├── render.ts                              # NOVO — compara pixels das cenas (FR-041)
    ├── shaderLibrary.ts                       # NOVO — compila todos os módulos + referências na GPU
    ├── computeKernels.ts                      # NOVO — kernels genéricos contra CPU
    └── fixtures/                              # NOVO — trajetórias e imagens de antes da 005

clay-engine-doc/docs/guides/
├── architecture_resource_loaders.md          # D5 + seção de shaders
├── shaders.md                                 # NOVO — guia do núcleo de shaders
└── migration_legacy_to_clean.md / getting_started.md # notas de migração
specs/ROADMAP.md                               # §3 itens resolvidos, D5 resolvida, status F1/005
```

**Structure Decision**: biblioteca única; composição em C2 (consumida por contrato), biblioteca e kernels em C3,
estágios de C4 migrados. As fixtures de antes (trajetória e imagem) são gravadas na primeira fase, antes de qualquer
mudança em WGSL, e versionadas.

## Fases de implementação (para `/speckit-tasks`)

1. **Fixtures de antes**: smokes `trajectories` (com medição de determinismo entre execuções e critérios físicos) e
   `render`; correção da física que nunca rodou (Fase 1b: `ColliderSet`, colisão dos fluidos, XPBD com restrições);
   gravação.
2. **Fundação C2**: varredor, `wgslModule`, `composeWgsl`, erros; `StructSchema` (tipos, `addressSpace`, `toWGSL`,
   `packInto`); `createComputeKernel`/`PipelineDescriptor` com `WgslModule`.
3. **US1 + US2** por estágio, um de cada vez, com fixtures verdes a cada passo: TransformFlow → busca de vizinhança →
   XPBD → FEM → MPM → SPH → PBF → LCP → forward/sombra → pós → UI; schemas internos e `PerStepUniforms` por schema
   junto da migração de cada estágio; `structs/` removido ao final.
4. **US3**: `wgslLib` (consolidação de `linalg`/`mat`, `sph_kernels`, `lcp`), `color`/`brdf` extraídos do render,
   `noise`; testes de referência.
5. **US4**: `PrefixSum` (migra a vizinhança), `atomic_alloc`/`fixed_point` (migra o LCP), `RadixSort`, `Compaction`,
   `Reduce`, `GraphColorer`; smoke `computeKernels`.
6. **US5**: `fem` e decomposição polar extraídos; cascas removidas; `inventory.md`; verificações de inventário e de
   duplicação no gate.
7. **US6**: documento de arquitetura (D5 + shaders), `resolve` por prioridade e `Scene.add`, guia `shaders.md`, notas de
   migração, ROADMAP.
8. **Fechamento**: smokes (inclusive `--dist`), `bench:check`, gate completo, API regenerada, status da spec.

## Complexity Tracking

Sem violações da constituição.
