# Implementation Plan: Composição por grafos de nós e contratos de shader estruturados

**Branch**: `feature/031-node-graphs` | **Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/031-node-graphs/spec.md` · Roadmap: [`specs/ROADMAP.md`](../ROADMAP.md)
(F3b, fundação de F4/F5/F8) · Conversa: [conclusoes-2026-10-16.md](./conclusoes-2026-10-16.md) · Baseline: o
regravado na 010

## Summary

Torna a composição por nós o padrão do motor e tira do contrato de shader o acoplamento do legado:

1. **Contrato estruturado (C2)**: recursos declarados como módulos (`wgslResource`) com tipo, frequência e provider; a
   montagem emite as ligações e confere variáveis não declaradas e limites; grupos por frequência
   (`frame`/`stage`/`batch`/`draw`); estágios ligam por objeto e desenham por `groupsOf(frequência)` (R1–R3).
2. **Constantes e variantes (C2)**: `sharedConstant` com fonte única; variantes por composição e `override`;
   instanciação de módulo no lugar da renomeação por regex (R6, R7).
3. **Migração completa (C3/C4)**: os 141 arquivos WGSL e todos os estágios; pontos de cena `light_visibility` e
   `scene_light` com contribuintes declarados pela sombra e pela água; o forward, os sprites e a água sem conhecer
   sombra, luz ou água; seleção por família de desenho; WGSL da água na C4 (R4, R5).
4. **Registros tipados**: parâmetros por forma, sem bits e sem teto; listas posicionais como structs (R8).
5. **Grafo de nós (C2)**: `defineNode`, `NodeRegistry`, `NodeGraph` (Resource), sub-grafos, serialização; grafo de ponto
   compilado em SSA implementando um `WgslPoint` (as funções da 009 viram grafos de um nó); grafo de conjunto
   compilado num `GraphFlow` com intermediários alocados pela C2, contagens na GPU (`SetCount`, `CountToArgs`,
   despacho indireto), memória `stale/clean` e saída de malha pelo caminho da `ParametricSurface` (R9–R11).
6. **Biblioteca base (C3)** com referências de CPU (R12); **migração verificada bit a bit** (R13); smoke `nodeGraphs`,
   cena de bench `graph-geometry`, testes de varredura e vídeos (R14).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM; WGSL

**Primary Dependencies**: WebGPU (despacho e desenho indiretos, `indirect-first-instance` já tratado na 010); sem
dependências novas

**Storage**: N/A (fixtures em `src/__smokes__/fixtures/`; grafos serializados em JSON nos testes)

**Testing**: Vitest 4 (`countingCore`): `wgslResource` e emissão de ligações (determinismo, frequências, limites,
`manual-binding`, variável não declarada), `groupsOf`, `sharedConstant`, instanciação de módulo, pontos de cena com
contribuintes (ordem, pronto, rejeição), seleção por família, registros tipados (layout, valores, `revision`),
`NodeGraph` (validação de tipos, ciclos com caminho, contexto, identidade por forma, valores sem recompilar,
topologia recompilando, sub-grafo, JSON ida e volta), compilação de ponto (um `let` por nó), compilação de conjunto
(ordem, descritores intermediários, `SetCount`, estados `stale/clean`), biblioteca contra referências de CPU, testes
de varredura do repositório (SC-001–SC-004); smokes de navegador (inclusive `--dist`): `nodeGraphs` (novo) e **todos
os existentes sem regravar fixtures**; `bench:check`; `npm run ci`

**Target Platform**: Chrome/Edge com WebGPU (perfil de referência Apple Metal 3)

**Project Type**: biblioteca (engine)

**Performance Goals**: `bench:check` sem regressão relevante (CPU por quadro igual ou menor — `groupsOf` e layouts
emitidos evitam o `infer` por `PipelineState`); grafo de ponto com GPU igual à versão à mão (ruído do bench); montagem
de shader com grafo ≤ 10 ms por forma nova; `graph-geometry` (256² vértices, 20 000 instâncias realizadas) ≤ 2 ms de
GPU quando `stale` e ≈ 0 quando `clean`

**Constraints**: sem helpers (Resource + evento + Flow); `dispatch` só grava; nenhuma leitura de volta por quadro;
imagens e trajetórias bit a bit; um símbolo WGSL por shader (agora incluindo recursos); C3/C4 importam só a C2; C1
inalterada (só `constants` repassados, já suportados); sem ciclos

**Scale/Scope**: C2 (`scene/shaders`, `scene/systems/LayoutInferencer` → leitura das declarações,
`flowBinding/*`, `flows/createComputeKernel`, `descriptors/PipelineDescriptor`, `contracts/ExtensionFunction`,
`scene/graph` novo); C3 (todos os `shaders.ts`, 141 WGSL, pontos e funções da 009, primitivas de compute com contagem
da GPU, `CountToArgs`, `elements/nodes` novo, `ShadowMap` e luzes com contribuições); C4 (todos os estágios,
`presentation/water` novo, `WaterSurface`); smokes; bench; docs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                       | Avaliação                                                                                                                                                                                                             | Status |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **I. Camadas e importação**     | Contrato, grafo e `GraphFlow` na C2; nós, pontos e primitivas na C3; estágios e água na C4; C3/C4 importam só a C2; estágios deixam de importar estágios (teste de varredura)                                         | ✅     |
| **II. Domínio na borda**        | Autoria por nós com portas e parâmetros nomeados; frequência, grupo, ligação e layout de registro são internos                                                                                                        | ✅     |
| **III. Resource como contrato** | `NodeGraph` é Resource (parâmetros em pool, intermediários e contagens como descritores); `GraphGeometry` é Geometry; contribuições de cena declaradas por Resources                                                  | ✅     |
| **IV. ECS e Flows**             | Grafo de conjunto compilado num `Flow` com slots e transições; compilação e troca em transições (`framePrepare`, `pipelinesCompiled/Rejected`); `dispatch` só grava; ordem por fase declarada pelo grafo e prioridade | ✅     |
| **V. Testes**                   | CPU para contrato, compilação, validação, serialização e biblioteca; GPU por smokes com medidas (fonte e dist); varreduras como teste; fixtures existentes como prova de migração sem regravar                        | ✅     |
| **VI. Documentação**            | Arquitetura (seção de shaders reescrita: recursos declarados, frequências, pontos de cena; seção nova de grafos; relação com Flows e slots); guia de nós; ROADMAP; JSDoc                                              | ✅     |
| **Restrições técnicas**         | Sem deps; mudança incompatível documentada: `PipelineDescriptor.consumes` removido e `@group/@binding` proibido em módulos de usuário (nós WGSL e funções da 009 já não declaravam ligações)                          | ✅     |
| **Quality gates**               | `npm run ci` + smokes (fonte e `--dist`) + `bench:check`                                                                                                                                                              | ✅     |

**Re-check pós-design (Fase 1)**: ✅ — o [contrato](./contracts/node-graphs.md) mantém a API das funções da 009; a C1
não muda; a ordem entre Flows continua por fase + prioridade (o `GraphFlow` declara a fase); dados entre estágios
continuam Resources no World, com o estado "produzido" generalizado na C2.

## Project Structure

### Documentation (this feature)

```text
specs/031-node-graphs/
├── spec.md
├── conclusoes-2026-10-16.md
├── plan.md
├── research.md          # Achados A1–A20, decisões R1–R14
├── data-model.md
├── quickstart.md
├── contracts/node-graphs.md
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/scene/shaders/WgslResource.ts (NOVO), SharedConstant.ts (NOVO), WgslModule.ts, composeWgsl.ts,
    scanWgslSymbols.ts (identificadores e locais), bindPoints.ts, WgslPoint.ts (pontos de cena por contribuição)
src/scene/systems/LayoutInferencer.ts                       # lê declarações; visibilidade por alcance
src/scene/systems/flowBinding/FlowRuntime.ts, PipelineState.ts, ScenePoints.ts, sources.ts
src/scene/flows/FlowBinding.ts (groupsOf), createComputeKernel.ts (Map<WgslResource,…>), ExtensionPipelines.ts
src/scene/descriptors/PipelineDescriptor.ts (family, constants; − consumes), ExtensionRecord.ts (removido)
src/scene/contracts/ExtensionFunction.ts (grafo de um nó; registro tipado), Resource.ts (getSceneContributions)
src/scene/graph/ (NOVO): NodeDefinition.ts, NodeRegistry.ts, NodeGraph.ts, Subgraph.ts, compilePointGraph.ts,
    compileSetGraph.ts, GraphFlow.ts, SetCountSchema.ts, serialize.ts
src/elements/**/shaders.ts + src/elements/gpu/wgsl/** (141 arquivos)  # sem @group/@binding; recursos declarados
src/elements/gpu/shaders/resources.ts (NOVO)                 # recursos compartilhados: cameras, worlds, lights…
src/elements/gpu/shaders/constants.ts (NOVO)                 # WORKGROUP_SIZE, NONE, …
src/elements/gpu/compute/*.ts                                # contagem da GPU; CountToArgs.ts (NOVO)
src/elements/scene/ShadowMap.ts, Light.ts                    # contribuições de cena; caster como dado
src/elements/scene/points/ (NOVO): lightVisibility.ts, sceneLight.ts
src/elements/extension/*Function.ts, combineFields.ts, combineSpace.ts
src/elements/nodes/ (NOVO): input, math, map, noise, color, condition, space, field, surface, set/*, output
src/elements/geometry/GraphGeometry.ts (NOVO), MeshVertexSchema.ts (NOVO)
src/presentation/flows/*.ts                                  # todos os estágios migrados; sem importações cruzadas
src/presentation/water/ (NOVO): shaders.ts, schemas.ts, wgsl/*  # vindo de elements/material
src/presentation/app/WaterSurface.ts                        # contribuição de cena; produzido genérico
src/__tests__/scan/ (NOVO): bindings, groupLiterals, stageImports, sharedConstants, implicitGlobals
src/__smokes__/nodeGraphs.ts (NOVO) + support/nodeGraphReference.ts (NOVO)
bench/scenes/graph-geometry (NOVA)
clay-engine-doc/docs/guides/ (arquitetura: shaders e grafos; guia de nós), specs/ROADMAP.md, specs/PENDENCIAS.md
```

**Structure Decision**: biblioteca única; o grafo é um pacote novo da C2 (`scene/graph`), ao lado de `scene/shaders` e
`scene/flows`, porque compila para os dois; a biblioteca de nós é um pacote novo da C3.

## Fases de implementação

1. **Fundação do contrato (C2)**: `WgslResource`, emissão de ligações, frequências, `groupsOf`, `manual-binding`,
   variáveis não declaradas, limites, `sharedConstant`, instanciação de módulo, `constants`; testes de unidade.
2. **Recursos e constantes compartilhados (C3)**: módulos de recursos (`cameras`, `worlds`, `renderables`,
   `instances`, `lights`, `shadow_*`, `field_*`, `space_*`, …) e de constantes.
3. **Migração dos módulos e kernels de compute** (física, transformação, câmera, superfície, primitivas,
   vizinhança, partículas): sem `@group/@binding`, ligação por objeto, `groupsOf`; trajetórias e manifestos bit a bit
   a cada pacote.
4. **Pontos de cena e desacoplamento do render**: `light_visibility`, `scene_light`, contribuições da sombra e da água,
   seleção por família, `ForwardFrameParams` enxuto, WGSL da água para a C4, estado "produzido" genérico; imagens bit
   a bit.
5. **Registros tipados e pontos da 009**: structs por forma, listas como structs, campos prontos com schema; funções da
   009 sem mudança de API.
6. **Grafo de ponto**: definições, registro, `NodeGraph`, validação, compilação SSA, alvo `WgslPoint`, sub-grafos,
   serialização; as funções da 009 como grafo de um nó.
7. **Grafo de conjunto**: `SetCount`, `CountToArgs`, primitivas com contagem da GPU, `GraphFlow`, intermediários,
   memória `stale/clean`, `GraphGeometry`, `MeshVertex` (inclusive em `wire.wgsl` e `point_sprite.wgsl`).
8. **Biblioteca base** com referências de CPU.
9. **Testes de varredura**, smoke `nodeGraphs`, cena `graph-geometry`, `bench:check` e baseline regravado.
10. **Documentação** (arquitetura, guia de nós, ROADMAP, PENDENCIAS) e **vídeos**.

## Complexity Tracking

| Item                                                      | Por que é necessário                                                                             | Alternativa mais simples rejeitada porque                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Migração dos 141 WGSL e de todos os estágios numa spec    | Contrato misto (metade declarado, metade texto) manteria os dois mecanismos e os erros de índice | Migração gradual deixaria `LayoutInferencer` por regex e ligação por string convivendo (FR-031) |
| Instanciação de módulo (renomeação por token) na montagem | Vários contribuintes e nós com o mesmo código no mesmo shader precisam de símbolos distintos     | Regex sobre o texto (hoje) renomeia em comentários e substrings e é remendo de fonte (FR-009)   |
| `GraphFlow` genérico na C2                                | Grafo de conjunto é um Flow; memória e contagens precisam ser do padrão, não de cada Flow        | Gerar um Flow escrito à mão por grafo — impossível para grafos do usuário                       |
