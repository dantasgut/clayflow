# Research: Slots de Flow

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Data**: 2026-10-12

Levantamento do código em `feature/005-shader-modules` (`e2368b8`). Achados (A) descrevem o estado atual; decisões (R)
fixam a abordagem, com alternativas rejeitadas.

---

## Achados

### A1 — Peças do modelo de slots existem, desligadas

- `LayoutInferencer` (`scene/systems/LayoutInferencer.ts`) só faz `parseWGSL` por regex: grupos, bindings, address
  space e os estágios cujo **corpo de entrada** cita a variável — uma variável usada só dentro de uma função auxiliar
  chamada pela entrada não é detectada. Não há `infer`; é instanciado em `createScene` e exposto por
  `Application.layoutInferencer`, sem uso.
- `ConsumerResolverRegistry` e as estratégias `SingletonResolver`, `PerEntityResolver`, `PoolResolver`
  (`scene/consumers/`) existem; nenhum resolver é registrado; `ConsumerResolver.resolve` devolve `BindingEntry[]` com
  `binding` numérico (o resolver precisaria saber o índice do shader).
- `EventMap` declara `flowReady` e `bindGroupReplaced`; nenhum é emitido. `PipelineDescriptor.consumes` é preenchido
  por materiais e estágios e não é lido por ninguém. `FlowDescriptor` existe; nenhum corpo do motor declara
  `getFlowDescriptors` (cada algoritmo tem o seu schema).
- `ResourceSystem` cria por pool um layout e um bind group com visibilidade só `COMPUTE` (`createPool`,
  `ResourceSystem.ts:561-578`) que ninguém usa (`poolBindGroup` sem chamadas).

### A2 — Forward e sombra por entidade

`ForwardFlow.ensureSlot` (`ForwardFlow.ts:671-763`) cria por entidade: VBO e IBO (cópia da geometria — a C2 já
alocou os descritores da `Geometry`), buffer + bind group de câmera, buffer + bind group de material e uma posse do
shader. A cada quadro, `uploadPerFrameData` grava a câmera **e** o material de cada entidade (2 × N escritas). Os
layouts são escritos à mão. As entidades são achadas por `instanceof` em `onEntitiesInserted`. `ShadowFlow` repete o
padrão (VBO/IBO por entidade), calcula a matriz da luz na CPU (caixa ortográfica fixa) e a entrega ao forward por
getter (`currentLightViewProj`) — o `ShadowMap` Resource não é usado por ninguém; o forward usa viés fixo 0,005 e a
direção padrão `[0.4, -1, 0.6]` sem luz. Forward e pós ligam-se por referência direta
(`bindShadowFlow`/`bindForwardFlow`); as texturas de tamanho do canvas (profundidade, cor fora da tela, pingue-pongue
do pós) são criadas e recriadas pelos estágios.

### A3 — Registro, seleção e prontidão

- `FlowRegistry.register(flow)` recebe instância; fase, prioridade e `bodyType` vêm do próprio Flow.
- Seleção de solver: `DEFAULT_FLOW_FACTORIES` + `autoRegisterFlows` (`elements/physics/flows/defaultFlows.ts`),
  chamados pela `Application` em `resourcesChanged`, casando `schema.name` de cada descritor.
- Prontidão: `isReady()` consultado a cada quadro (`poolCount > 0` nos solvers; sempre verdadeiro no forward e no
  Transform). Pipelines assíncronos marcados por flags próprias (`preferAsync`, `pipelineReady`).

### A4 — Estado ad hoc e invalidação por callbacks

Cada solver guarda kernels anuláveis, contadores de geração e flags (`LCPFlow`: 9 kernels + mapa de narrowphase,
`narrowphaseGeneration`, `readbackInFlight`…); a invalidação vem de `onPoolReallocated` (broadcast a todos os Flows
pelo `ExecutionSystem`), de `PerStepUniforms.reserve()` que devolve `true` e de comparações de geração **dentro do
`dispatch`** (`LCPFlow.ts:663,687`, `MPMFlow.ts:317`, SPH/PBF) — kernels e bind groups são recriados durante a
gravação do quadro. `TransformFlow` só redespacha em `resourceReady` de um Transform ou realocação: se a contagem muda
sem `resourceReady` (remoção), não redespacha. Nenhum Flow trata redimensionamento além do forward e do pós.

### A5 — Fronteira de importação (D4)

24 arquivos de C3/C4 importam `core/contracts/index` (todos `import type`; lista no relatório do levantamento:
kernels genéricos, `NeighborSearchPipeline`, `ColliderSet`, os 6 solvers, `PerStepUniforms`, `TransformFlow`, os
estágios de C4, `UiGpuPipeline`, `defaults.ts`). Nenhuma regra do lint impede; a regra existente
(`eslint.config.js:189`) é a de `bench/`. A constituição (Princípio I) **permite** `core/contracts` em C3/C4; o
documento de arquitetura e a D4 pedem os reexports de `scene/`.

### A6 — Defeitos encontrados no levantamento

- LCP: o mapeamento slot → entidade do readback é feito quando a leitura resolve, não quando a cópia foi gravada
  (`LCPFlow.ts:912-917`) — uma remoção entre os dois aplica a pose à entidade errada.
- `TransformFlow` não redespacha quando a contagem muda por remoção (A4).
- `ColliderSet.bindings()` omite o pool de malha (só o LCP o liga, à parte) — coerente com P2 (malha sem contato).
- Comentário do `XPBDFlow` diz 1 substep padrão; o código usa 8.
- Busca de vizinhança e o `pbf_delta` sem guarda para mais de 65 536 partículas (E4, F5).

### A7 — Capacidades da C1 disponíveis

`Binder.setBindGroup(index, spec, dynamicOffsets?)` (compute e render); `capabilities().limits`
(`minUniformBufferOffsetAlignment`); buffers de vértice, índice e indireto já nascem com `STORAGE`
(`GpuEngineCore.ts:36-44`) — falta só o contrato de binding de compute aceitá-los (FR-015).

---

## Decisões

### R1 — `Flow<TSlots, S>`: declaração de slots, estado e gravação

**Decisão**: `Flow` passa a ser genérico em `TSlots` (mapa nome → declaração de slot) e `S` (união de estados
nomeados). O Flow declara `slots` (valor imutável construído por `slot.*`), `pipelines` (`PipelineDescriptor[]`), a
tabela de transições `transitions` e implementa `dispatch(frame, bound)`, onde `bound` traz os slots resolvidos e os
pipelines preparados (pipeline + bind groups por grupo). Fase, prioridade e `bodyType` saem da classe e vão para o
registro (R4). O estado tem uma parte comum gerida pela C2 (`pending → preparing → ready`, `disposed`) e a parte
própria `S` do algoritmo; ambas mudam só por eventos (R5).

**Por quê**: é o contrato do documento (`Flow~TSlots,S~`, `#onEvent(event) S`, "dispatch é o único ponto de
gravação"); separa o que a C2 resolve do que o algoritmo grava.

**Alternativas**: manter `isReady()` e callbacks e só ligar o `LayoutInferencer` — rejeitada: mantém os dois caminhos
de invalidação (A4) e a preparação dentro do `dispatch`.

### R2 — Tipos de slot

| Declaração                              | Resolve para                                                   | Exemplos                                               |
| --------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `slot.pool(nome)`                       | buffer do pool + contagem + geração                            | `WorldTransform`, `DistanceConstraint`, `Light`        |
| `slot.bodies()`                         | o pool do `bodyType` da instância                              | `LCPSchema`, `XPBDSoftSchema`                          |
| `slot.pools(nomes)`                     | conjunto de pools (vazio = placeholder)                        | colliders: `PlaneCollider`, `BoxCollider`, …           |
| `slot.singleton(schema, { optional? })` | o Resource ativo do schema e seus buffers                      | `Camera`, `Time`, `ParticleMaterial`, `GravityField`   |
| `slot.entities({ all: [schemas] })`     | conjunto de entidades com esses Resources, mantido pela C2     | renderizáveis (Geometry + Material + Transform), luzes |
| `slot.texture(schema, descId)`          | textura/view alocada para o descritor de um Resource singleton | profundidade do `ShadowMap`, cor da cena               |
| `slot.target(...)` (só `RenderFlow`)    | `'canvas'` ou textura de um Resource                           | forward → cor da cena; pós → canvas                    |

Slots obrigatórios não resolvidos mantêm o Flow em `pending`; `optional` resolve para "ausente" e o Flow decide
(gravidade padrão). `slot.entities` substitui o `instanceof` em `onEntitiesInserted`: a C2 mantém o conjunto ao
inserir/remover e entrega, por entrada, os Resources e as alocações (`ResourceDirectory`).

**Alternativas**: um único tipo "consume por nome" (só `consumes`) — rejeitada: o desenho e a sombra precisam de
dados por entidade (geometria para `pass.geometry`, slot do material) que não são bindings.

### R3 — Bindings: `consumes` + bindings privados, por nome do WGSL

**Decisão**: para cada pipeline, a C2 monta o WGSL (`composeWgsl`), extrai os bindings (R6) e decide a fonte de
cada um nesta ordem:

1. **binding privado** fornecido pelo Flow pelo **nome da variável** do WGSL (`bindings: { params: { buffer, dynamic:
true }, contacts: buffer }`) — temporários e uniforms por passo do algoritmo;
2. **`consumes`**: o tipo do binding (struct, ou elemento de `array<…>`) é o `wgslName` de um schema; se esse nome
   está em `consumes`, o `ConsumerResolverRegistry` resolve a fonte;
3. senão, erro (FR-012) nomeando binding, grupo, pipeline e Flow.

O resolver passa a devolver uma **fonte** (`{ kind: 'buffer' | 'textureView' | 'sampler', spec, dynamic?, size?,
generation }`), não um `BindingEntry` com índice — o índice vem do WGSL. Incompatibilidade (uniform × storage, textura
de profundidade × cor) falha na preparação.

**Por quê**: o nome do struct já é a ligação TS↔WGSL desde a 005 (structs gerados do schema); casar por ele mantém os
`.wgsl` atuais intactos (imagem e trajetória iguais). Bindings privados por nome evitam índices escritos à mão.

**Alternativas**: casar por nome de variável também para `consumes` — rejeitada: duas entradas usam a mesma câmera
com nomes diferentes; o tipo é o contrato.

### R4 — Registro por factory e seleção pela C2

**Decisão**:

```ts
flows.register(factory, { type, phase, bodyType?, priority? }): FlowRegistration
flows.unregister(registration): boolean
flows.override(bodyType, factory, options?)        // substituição explícita, vence a prioridade
```

- Factory: `(ctx: FlowContext) => Flow` com `ctx = { core, world, resources, events, bodyType? }`.
- Registro **sem `bodyType`** (render, transform, UI): instanciado no registro e entregue à C2
  (`ResourceSystem.ensureFlowAllocated`).
- Registro **com `bodyType`**: instanciado pela C2 quando o primeiro Resource cujo pool tem essa chave é alocado
  (`ensureFlowAllocated(bodyType)`), uma instância por `bodyType`. Vários registros para o mesmo `bodyType`: resolve
  pela regra única (override → maior prioridade → último registrado).
- `bodyType` = chave do pool do corpo: `${schema.name}:${algorithm}` com `FlowDescriptor`, senão `schema.name` (o que
  `computePoolKey` já faz).
- `DEFAULT_FLOW_FACTORIES` e `autoRegisterFlows` saem; `createScene` registra as factories padrão dos solvers (sem
  instanciar) e a `Application` as de apresentação. `registerPresentationDefaults` devolve as instâncias (o app ainda
  faz `defaults.post.addEffect(...)`).

**Alternativas**: instanciar todos os Flows no registro — rejeitada: aloca solvers que a cena nunca usa.

### R5 — Máquina de estados por eventos

**Decisão**: estados comuns geridos pela C2: `pending` (slot obrigatório ausente) → `preparing` (pipelines
compilando) → `ready` → `disposed`. Eventos entregues ao Flow pela C2: `slotsResolved`, `slotLost`,
`pipelinesCompiled`, `bindGroupReplaced`, `entitiesChanged`, `canvasReconfigured`, `poolReallocated` (dos pools que o
Flow consome) e eventos de domínio que o Flow declara (`resourceReady` de um schema). A tabela `transitions` do Flow
mapeia `(estado, evento) → { to, run? }`; `run` é onde o Flow recria recursos **privados** (ex.: contatos do LCP após
crescimento do pool) — nunca no `dispatch`. Evento sem transição a partir do estado atual lança com Flow, estado e
evento (FR-002); eventos que o Flow declara ignorar entram na tabela como `ignore`.

`flowReady` é emitido pela C2 na entrada em `ready`; o `ExecutionSystem` mantém `activeFlows` por esse evento e pela
saída de `ready` (FR-008). Os broadcasts do `ExecutionSystem` (`onPoolReallocated`, `onCanvasResized`,
`onEntitiesInserted`, `onEntitiesRemoved`) e `onEvent`/`isReady` saem (FR-004).

**Alternativas**: máquina de estados em classes (State Pattern por Flow) — rejeitada: cada solver teria 3–6 classes
de estado triviais; a tabela é testável e serializável.

### R6 — `LayoutInferencer.infer`

**Decisão**: `infer(composedSource, entryPoints)` devolve, por grupo, as entradas de layout:

- estágios por **alcance de chamadas**: a partir de cada entrada, as funções de módulo chamadas transitivamente
  (varredura de símbolos da 005); um binding é visível nos estágios cujas funções alcançadas o citam (corrige A1);
- tipo: `var<uniform>` → `uniform`; `var<storage, read>` → `read-only-storage`; `var<storage, read_write>` →
  `storage`; `texture_depth_*` → textura `depth`; `texture_2d<f32>` → `float` (`unfilterable-float` quando o formato
  resolvido não é filtrável); `texture_storage_*` → storage texture com formato e acesso do tipo; `sampler` /
  `sampler_comparison`;
- `hasDynamicOffset` quando a fonte resolvida é dinâmica (pool uniforme, uniforms por passo);
- campos explícitos do descritor (`binding`, `visibility`) vencem (FR-013).

Layouts e bind groups são criados pela C2 (`ResourceSystem`), com discriminadores derivados de pipeline e grupo;
layouts idênticos deduplicam pelo hash da 004.

### R7 — Bind groups da C2 e `bindGroupReplaced`

**Decisão**: o `ResourceSystem` mantém, para cada pipeline preparado, os bind groups por grupo e um índice
`fonte → bind groups que a usam`. Quando uma fonte muda (pool cresce, textura de canvas recriada, recurso
singleton trocado, Flow troca um buffer privado com `rebind`), recria só os bind groups afetados, destrói os antigos
depois do `submit` corrente e emite `bindGroupReplaced { poolKey | source, oldSpec, newSpec }`; o Flow recebe o
evento e passa a usar `bound` atualizado (que já aponta para o novo). O layout e o bind group "do pool" de hoje
(`createPool`) saem.

### R8 — Material em pool uniforme com offset dinâmico

**Decisão**: descritor `role: 'uniform', storage: 'pool'` produz um **pool uniforme**: buffer `UNIFORM` com stride
arredondado a `minUniformBufferOffsetAlignment`; consumido como `var<uniform> material: StandardMaterial` com offset
dinâmico `slot × stride`. Os materiais passam a declarar `storage: 'pool'`; o forward faz `setBindGroup(2,
materialPool, [offset])` por desenho. O WGSL do forward não muda.

**Por quê**: cumpre a definição da D5 (Material em pool por schema) sem precisar do pool `Renderable` (F2), que
juntaria os slots de material e transform num registro por desenho. 10 mil materiais × 256 B = 2,5 MB.

**Alternativas**: pool de storage indexado por um segundo índice por desenho — exige o registro `Renderable` (F2);
pool de storage com offset dinâmico — mesmo alinhamento (256) e muda o WGSL.

### R9 — Alvos de render, sombra e cor da cena como Resources

**Decisão**:

- `FrameTargets` (C4, Resource inserido pela `Application`): descritores `color` (`format: 'canvas'`,
  `sizeFromCanvas`) e `depth` (`depth24plus`, `sizeFromCanvas`). O forward desenha em `slot.target(FrameTargets,
'color')` com profundidade em `FrameTargets.depth`; o pós lê `slot.texture(FrameTargets, 'color')`. A C2 já recria
  texturas `sizeFromCanvas` em `canvasReconfigured` (R7 emite a substituição). `TextureShape.format` aceita `'canvas'`
  (resolvido para `core.canvasFormat`); o uso da textura passa a ser derivado do formato (profundidade: só
  `RENDER_ATTACHMENT | TEXTURE_BINDING`).
- `ShadowMap` ganha o descritor da textura de profundidade (`depth32float`, `size`) e passa a ser parte da
  `DirectionalLight` (anexada no construtor, como `RigidBody` anexa `Transform` e collider). O `ShadowFlow` desenha
  nessa textura (`slot.target`); o forward amostra (`slot.texture`) e lê `lightViewProj` e `bias` do struct gerado de
  `ShadowMap.schema` (FR-021) pelo pool `ShadowMap`.
- A matriz da luz continua calculada na CPU (o kernel de câmera/luz é F2): o `ShadowFlow` reage a `resourceReady` da
  luz e grava `shadowMap.data.lightViewProj`; o `flushDirty` do `ResourceSystem` passa a drenar a fila até esvaziar,
  então a derivação entra no mesmo quadro.
- Padrões do `ShadowMap` passam a reproduzir o comportamento de hoje: `bias` 0,005, `size` 1024 (imagem idêntica).
  `ForwardShadowParams` sai; a direção da luz e o "sombra ligada" vão num uniform privado do forward por quadro
  (`ForwardFrameParams`), escrito uma vez por quadro; sem luz, a direção padrão de hoje.

**Alternativas**: `RenderTarget` como Resource geral com multi-câmera — é a 014 (F4); aqui só os alvos que os
estágios padrão já usam.

### R10 — Geometria única

**Decisão**: forward e sombra usam `resources.bufferOf(geometry, 'vertices' | 'indices')` (já alocados pela C2 desde a
004); os VBO/IBO por entidade saem. `indexCount`/`indexFormat` vêm do `IndexBufferSpec` alocado.

### R11 — Pipelines de render e variantes

**Decisão**: o forward declara um `PipelineDescriptor` por shader de material (o do material, por id), com variantes
de `frontFace` (`ccw`/`cw`) pedidas à C2 como pipelines distintos do mesmo descritor; a C2 prepara e informa
`pipelinesCompiled` (síncrono ou `createAsync`, conforme `preferAsync`). O desenho itera os renderizáveis na ordem de
inserção (imagem idêntica), trocando pipeline e bind group de material só quando mudam; grupos 0, 1 e 3 uma vez por
passe. Topologia do material continua ignorada como hoje (respeitá-la é a 008).

### R12 — Solvers no modelo de slots

| Flow      | Slots                                                                      | Privados (bindings por nome)                                           | Transições próprias                                               |
| --------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| LCP       | `bodies`, `colliders` (pools + donos), `time`, `gravity?`                  | uniforms por passo, contatos, bVec, warm, contador, por corpo, staging | `poolReallocated(bodies/colliders)` → recria contatos e por corpo |
| XPBD      | `bodies`, `constraints` (`DistanceConstraint`), `time`, `gravity?`         | uniforms por passo                                                     | —                                                                 |
| FEM       | `bodies`, `time`, `gravity?`                                               | uniforms por passo                                                     | —                                                                 |
| MPM       | `bodies`, `colliders`, `material` (`ParticleMaterial`), `time`, `gravity?` | grade, uniforms                                                        | `resourceReady(ParticleMaterial)` → recria grade                  |
| SPH / PBF | `bodies`, `colliders`, `material`, `time`, `gravity?`                      | busca de vizinhança, `pbf_delta`, uniforms                             | idem + vizinhança                                                 |
| Transform | `Transform`, `WorldTransform`                                              | params                                                                 | `entitiesChanged`/`resourceReady(Transform)` → redespacha         |

`ColliderSet` vira peça de slot: os mapas de dono são recursos privados dela, reconstruídos na transição (não no
`dispatch`); passa a incluir o pool de malha no grupo (A6). `PerStepUniforms.reserve()` deixa de invalidar kernels:
o buffer cresce em transição e é religado por `rebind`. Readback do LCP: o mapa slot → entidade é capturado na
gravação da cópia (A6). Kernels genéricos e `NeighborSearchPipeline` recebem buffers dos slots; `createComputeKernel`
passa a inferir o layout do WGSL (R6) e aceita buffers de vértice, índice e indireto (FR-015).

### R13 — Fronteira de importação (D4)

**Decisão**: `scene/contracts/gpu.ts` reexporta (só tipos) o que C3/C4 usam de `core/contracts` (`EngineCore`,
`Frame`, specs de buffer/textura/pipeline/bind group, `RenderTarget`, `ComputeKernel*`); os 24 arquivos passam a
importar de `scene/`. Regra `no-restricted-imports` no ESLint para `src/elements/**` e `src/presentation/**`
proibindo `**/core/**`. A constituição (Princípio I lista `core/contracts` como permitido) recebe emenda MINOR
(1.1.0) alinhando à D4 — registrada no PR para ratificação do mantenedor.

### R14 — Medição e verificação

- **Objetos por entidade (SC-001)**: teste com `EngineCore` de contagem (double da C1) inserindo 10 mil renderizáveis
  — nenhuma criação no forward/sombra por entidade; smoke `churn` confere o mesmo na GPU.
- **Escritas de câmera (SC-002)**: double conta `write` por spec por quadro (≤ 1 por câmera, só quando suja).
- **Trajetórias (SC-006)**: o smoke `trajectories` passa a rodar cada cena com quadros de 1/30, 1/60 e 1/144 s contra
  a mesma fixture (passo fixo de 1/60 pelo `Time`).
- **Imagem (SC-007)**: smoke `render` contra as fixtures da 005, inclusive com `--dist`.
- **Desempenho (SC-003)**: `bench:check` contra o baseline vigente; meta de −30% na CPU por quadro de
  `instances/10k` (hoje 64 ms; 20 mil escritas por quadro saem).

### R15 — Documento e guia

Documento de arquitetura: todas as marcas "alvo da 006" viram estado atual (Flow com slots, `RegisterOptions`,
`LayoutInferencer.infer`, `ConsumerResolver` com fontes, `bindGroupReplaced`, pool de Material, ShadowMap lido pelo
shader, alocação da bag consumida pelos estágios); exemplos de Flow, `register` e `consumes` reescritos com a API
real. Guia novo `flows.md` (escrever um Flow N3). Guia de migração: registro por instância → factory; callbacks →
transições; `bindShadowFlow`/`bindForwardFlow` → slots; `ShadowFlowOptions.mapSize` → `ShadowMap.size`.
