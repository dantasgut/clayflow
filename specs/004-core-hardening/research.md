# Research: Endurecimento do núcleo

**Spec**: [spec.md](./spec.md) · **Data**: 2026-10-06 · Base: auditoria do código em `develop` (`2873cf0`), quatro
levantamentos (identidade/specs, tempo/Flows, ResourceSystem/World, dispositivo/índices/nomes/vazamentos).

## Achados que mudam o desenho

- **A1 — Uniforms reescritos no mesmo quadro chegam todos com o último valor.** `core.write` faz `queue.writeBuffer`
  na hora (`GpuEngineCore.ts:348-351`) e o `submit` vem depois do record: toda escrita do quadro entra na fila antes
  do command buffer. O `LCPFlow` escreve `dtSub` a cada substep e `fixedDt` no fim (`LCPFlow.ts:526-579`) — **todos os
  passes leem `fixedDt`; os substeps nunca receberam `dtSub`**. Com N passos fixos por quadro, o mesmo vale para todos
  os Flows. Consequência: parâmetros por passo precisam de regiões distintas de buffer (R6).
- **A2 — O build publicado não desenha.** No `dist/index.js` minificado as classes viram `ve`, `H`…, mas
  `ForwardFlow.isGeometry`/`isMaterial` e `ShadowFlow.isGeom` comparam `constructor.name` com `"BoxGeometry"` etc.
  (`ForwardFlow.ts:713-731`, `ShadowFlow.ts:462-471`; strings presentes no dist): nenhuma entidade é reconhecida como
  renderizável. FR-024/SC-007 deixam de ser robustez preventiva e passam a ser correção de defeito.
- **A3 — `destroy` é por conteúdo.** O store indexa por hash (`GpuResourceStore.ts:27`); destruir uma spec destrói o
  objeto de GPU de qualquer outra com o mesmo conteúdo. Liberar objetos na remoção (FR-025) exige posse por spec (R3).
- **A4 — `World` sem dono único.** `RESOURCE_TO_ENTITY_ID` é um `WeakMap` global do módulo, não limpo no `remove`;
  recurso compartilhado é remapeado para a última raiz (`World.ts:15,57,147`). O `defaultScene` é singleton: cada
  `Application.create` sem `scene` insere outro `Time` e registra de novo os Flows padrão; `dispose` não desfaz nada
  disso (`Application.ts:119-130,272-298`, `defaults.ts:64-83`).
- **A5 — Vértices: schema ≠ dado.** O schema de vértice das geometrias segue alinhamento de struct WGSL (stride 48),
  mas o dado real é intercalado com stride 32 (`BoxGeometry.ts:15-19` × `ForwardFlow.ts:624`).
- **A6 — Física por quadro, não por tempo.** Todos os Flows de física avançam 1 passo de `fixedDt` (1/60) por quadro;
  `Time.scale`/`fixedDt` não são lidos; o `dt` do `frameTick` é descartado pelo `ExecutionSystem`
  (`ExecutionSystem.ts:103`).

## R1 — Identidade memorizada e composta (C1)

**Decisão**: `specHash` passa a memorizar o resultado por **referência** num `WeakMap<object, string>` no próprio módulo
(C1, `core/gpu/specHash.ts`). A serialização canônica substitui cada valor aninhado que é uma spec (objeto com `kind`
de `ResourceSpec`) pelo **hash já memorizado** dela (`{"$spec":"<hash>"}`), calculado recursivamente pelo mesmo
mecanismo. Assim o WGSL de um shader é serializado e passado pelo SHA-1 uma vez, quando a `ShaderModuleSpec` é
hasheada pela primeira vez; pipelines e bind groups compõem a partir dele.

**Por quê**: a refundação fixa spec como identidade imutável (L476, L1966 item 2j); calcular uma vez por objeto é
consequência direta, sem estrutura nova. `WeakMap` libera a entrada junto com a spec (FR-002). Conteúdo igual →
hashes internos iguais → hash composto igual: a deduplicação por conteúdo é preservada (FR-003). Os caminhos quentes
(`setPipeline`/`setBindGroup`/`vertex`/`index`/`write`) usam objetos guardados em campos — o levantamento não achou
spec recriada por quadro (a `TextureSpec` do canvas por quadro não passa pelo hash).

**Alternativas rejeitadas**: cache por string canônica (continua serializando a cada uso); hash incremental mantido
pelo chamador (vaza responsabilidade da C1 para C2–C4); id por contador em vez de hash de conteúdo (perde dedup).

**Funções** (`BundleSpec.body`): hoje viram `"<fn>"` e bundles diferentes colidem. Passam a ter identidade por
referência (`WeakMap<Function, number>` com contador) dentro da serialização — dois bundles com corpos diferentes nunca
colidem; o mesmo corpo deduplica.

## R2 — Imutabilidade executável

**Decisão**: `GpuEngineCore.create`/`createAsync` congelam a spec em profundidade antes de hashear. O congelamento
percorre objetos e arrays, para em objetos já congelados (o que trata specs aninhadas compartilhadas e ciclos) e não
entra em funções. O contrato `EngineCore.create` documenta a regra. Em modo estrito (ESM), atribuir a uma spec
congelada lança `TypeError` na hora (FR-004).

**Por quê**: torna a premissa do cache verificável — mutação vira erro imediato, nunca hash velho. O levantamento
não achou mutação de spec após `create` em `src/`; o único efeito visível é o array `layouts` compartilhado entre
`pipelineSpec.layouts` e `kernel.layouts` (`createComputeKernel.ts:95`), que ninguém muta. Specs não contêm typed
arrays (que não podem ser congelados com elementos).

**Alternativas**: congelar só em desenvolvimento (a falha some em produção, onde o hash velho causaria o defeito mais
difícil); clonar e congelar a cópia (quebra a identidade por referência que o motor e os testes usam —
`uploadPolicy.test.ts:134`); `Proxy` somente leitura (custo em todo acesso).

## R3 — Posse no store de GPU

**Decisão**: cada entrada do store guarda o conjunto (`Set`) das specs (objetos) que a criaram. `create(spec)`
acrescenta o objeto; `destroy(spec)` o remove; o objeto de GPU só é destruído quando o conjunto esvazia. Criar duas
vezes o mesmo objeto não duplica a posse.

**Por quê**: `create` idempotente por conteúdo (refundação L1053) + `destroy` por conteúdo = um dono destrói o objeto
do outro (A3). Posse por objeto de spec corrige isso sem contador manual sujeito a desbalanço. É pré-requisito seguro
de FR-025.

## R4 — Dispositivo completo e relatório de capacidades

**Decisão**:

- `ApplicationOptions.device?: DeviceOptions` → `core.initialize(canvas, canvasOptions, deviceOptions)` (contrato C1).
  `DeviceOptions = { powerPreference?, requiredFeatures?, optionalFeatures?, requiredLimits? }`.
- Features: o motor pede as **opcionais que usa** quando disponíveis (`timestamp-query`); `requiredFeatures` do
  usuário ausente → erro claro; `optionalFeatures` ausente → só no relatório.
- Limites: o motor pede o **máximo do adaptador** para os limites com que suas cenas escalam — `maxBufferSize`,
  `maxStorageBufferBindingSize`, `maxStorageBuffersPerShaderStage`, `maxBindGroups`,
  `maxComputeWorkgroupStorageSize`, `maxComputeInvocationsPerWorkgroup` — e respeita `requiredLimits` do usuário
  (acima do máximo → usa o máximo e registra).
- Relatório: `core.capabilities(): DeviceCapabilities` (contrato C1, só dados): adaptador (`vendor`, `architecture`,
  `device`, `description`, `isFallbackAdapter`), `powerPreference` pedida, features obtidas e desejadas ausentes,
  limites efetivos. C4 o expõe em `app.capabilities` sem importar `core/gpu`. Recalculado em `requestRecover`.
- `requestRecover`/resize reaplicam as `canvasOptions` originais (hoje voltam a `opaque`).

**Por quê**: sem limites, cenas grandes batem nos defaults (pools crescem 2× sem teto); sem relatório, diferenças entre
máquinas não são diagnosticáveis (o bench já precisou do adaptador para o `profileId`). O `minUniformBufferOffsetAlignment`
do relatório é usado por R6.

Os limites de despacho e da busca de vizinhança são tratados em R16 e R17 (decisão do usuário, 2026-10-09: corrigir
na 004, não na F5).

## R16 — Despachos lineares dentro do limite por dimensão (C1)

**Achado**: todos os kernels de C3 sobre sequências (`@workgroup_size(64)`/`(256)`) despacham
`workgroups(ceil(n / WG))` em 1D e indexam por `gid.x` (22 chamadas em `NeighborSearchPipeline`, Flows de física e
`TransformFlow`). Acima de `maxComputeWorkgroupsPerDimension` (65 535 por padrão; 4,19 M elementos com WG 64, 16,7 M
com WG 256) o WebGPU rejeita o despacho com erro de validação que só aparece no console — o quadro segue sem o
trabalho.

**Decisão**: o contrato C1 `Dispatcher` ganha `invocations(count, workgroupSize)`: a C1, que conhece o limite do
device, distribui `ceil(count / workgroupSize)` grupos em `x = min(grupos, máx)` e `y = ceil(grupos / x)`.
`workgroups(x, y, z)` passa a validar cada dimensão contra o limite e lança `RangeError` que nomeia
`maxComputeWorkgroupsPerDimension`. Os kernels lineares calculam o índice com
`@builtin(num_workgroups)`: `i = gid.x + gid.y * nwg.x * WG` e mantêm a guarda `i >= n`. Todas as chamadas de C3
passam para `invocations`.

**Por quê**: o limite é do device (C1); C3 declara só "quantos elementos, com que tamanho de grupo", sem consultar
limites a cada despacho. A distribuição em 2D cobre até 65 535² grupos — muito acima de qualquer buffer possível.

**Alternativas rejeitadas**: cada Flow calcular o formato 2D (duplicação e consulta de limites em C3); vários
despachos com offset em uniform (mais passes e escritas por quadro, sujeito a A1); despacho indireto (não resolve o
teto por dimensão).

## R17 — Soma de prefixos em vários níveis (busca de vizinhança)

**Achado**: `ns_scan_groups` roda num único grupo de 256 e soma no máximo 256 somas de grupo: a grade fica limitada a
256 × 256 = 65 536 células; acima disso, as células além da 65 536ª recebem `cell_start` errado e os vizinhos se
corrompem sem erro.

**Decisão**: soma de prefixos hierárquica. Nível 0 = contagens das células; cada nível `l` produz
`ceil(n_l / 256)` somas de grupo, até um nível com ≤ 256 elementos, escaneado por `ns_scan_groups`; depois
`ns_scan_combine` desce nível a nível somando o prefixo do grupo. Cada nível tem seu buffer de somas e seu uniform de
contagem (escritos quando a grade muda, não por quadro — sem conflito com A1). Número de níveis =
`ceil(log256(células))`, calculado pela grade; despachos por `invocations` (R16).

**Por quê**: é o algoritmo padrão de scan em GPU sem limite de tamanho; os kernels existentes são reutilizados
(parametrizados por nível), não substituídos.

**Alternativas rejeitadas**: aumentar o grupo do `scan_groups` (limitado por `maxComputeInvocationsPerWorkgroup`, só
desloca o teto); scan na CPU (readback por quadro); limitar a grade com erro (FR-030 exige funcionar).

## R5 — `Time` na C2, fonte única e acumulador

**Decisão**: `Time` sai de `presentation/app` para a C2 (`scene/time/Time.ts`), reexportado pela C4 (`app.time`). Um
`Time` por `World`: criado com a cena (`createScene`) e inserido no World; `Application` usa o da cena (não cria
outro). Campos: `realDt`, `dt` (efetivo = `realDt × scale`), `elapsed`, `frame`, `scale`, `physicsScale`,
`fixedDt` (default `1/60`; `undefined` = passo variável), `maxStepsPerFrame` (default 4), `accumulator`, e o
resultado do quadro: `steps`, `stepDt`, `droppedTime` (acumulado). Métodos: `advance(realDt)` (único que muda o
relógio), `pause/resume`, `pausePhysics/resumePhysics`.

`advance`: `dt = realDt·scale`; `physicsDt = dt·physicsScale`; com `fixedDt`: `accumulator += physicsDt`,
`steps = min(floor(accumulator/fixedDt), maxStepsPerFrame)`, `accumulator −= steps·fixedDt`; se o limite cortou,
o excedente acima de um passo é descartado e somado a `droppedTime` (evento `timeDropped`). Sem `fixedDt`: `steps = 1`
com `stepDt = physicsDt` (0 se pausado → `steps = 0`).

**Por quê**: os Flows de física são C3 e não podem importar C4 (Princípio I); C2 é a camada do ciclo do quadro. Um
único acumulador para todos os Flows garante que todos andam o mesmo número de passos no quadro (coerência entre
solvers). O documento de arquitetura põe `Time` em C4 — a mudança de camada fica registrada como correção do documento
(o que vale é a regra de importação).

**Alternativas**: acumulador por Flow (solvers dessincronizam); `ExecutionSystem` chamando `dispatch` N vezes (não
resolve A1 e repete trabalho de render).

## R6 — Passos múltiplos e parâmetros por passo

**Decisão**: os Flows de física leem `steps`/`stepDt` do `Time` do World (consulta por schema, como já fazem com
`GravityField`) e executam `steps × substeps` iterações no mesmo `dispatch`. Os parâmetros por iteração ficam num
buffer uniform com **uma região por iteração**, alinhada a `minUniformBufferOffsetAlignment` (do relatório, R4),
escrito **uma vez por quadro**; o bind group de parâmetros usa `hasDynamicOffset` e cada iteração liga sua região
(`setBindGroup(i, bg, [offset])`, já suportado pelo `Binder`). Capacidade = `maxStepsPerFrame × substeps`.

O bind group que contém o binding de parâmetros é o do kernel (o mesmo grupo dos demais buffers do kernel; o
offset dinâmico é propriedade do layout, invisível ao WGSL). No crescimento, o Flow refaz o kernel e libera o anterior
com `destroyComputeKernel` (C2) — com posse por spec (R3), recriar kernels sem liberar acumularia donos no store.

**Por quê**: é a única forma correta dentro de um único submit (A1); corrige de quebra o `dtSub` do LCP, que nunca
chegou à GPU. Escrita única por quadro reduz chamadas de `write`.

**Efeito esperado**: trajetórias do LCP mudam (passam a usar o `dtSub` correto) — o smoke de física e a cena
`rigid-bodies` são revalidados; a verificação contra o baseline é feita pela métrica de custo, não pela trajetória.

## R7 — Avanço explícito e laço

**Decisão**: `Application.step(dt = time.fixedDt ?? 1/60, frames = 1)` executa, por quadro, `time.advance(dt)` e emite
`frameTick` de forma síncrona — o mesmo caminho do `GameLoop`, que passa a só medir o tempo real e chamar o mesmo
avanço. O `frameTick` carrega `{ dt, realDt, elapsed, frame }`. O teto de `1/30` do `GameLoop` sai: o limite passa a
ser `maxStepsPerFrame` (física) e `maxFrameDt` (default 0,25 s, para controllers e animação).

**Por quê**: uma só definição de "avançar um quadro" garante SC-005 (com laço × sem laço). O bench, os smokes e os
testes param de emitir `frameTick` à mão.

## R8 — Paridade da física no benchmark

**Decisão**: o protocolo do benchmark fixa o **tempo simulado por quadro em 1/60 s** para as duas engines — o Rapier
já faz `world.step()` com `timestep = 1/60` uma vez por quadro (`bench/scenes/rigid-bodies/three.ts:18,65`). O
adaptador clayflow passa a chamar `app.step(1/60)`; o `dt` real continua alimentando o `update` das cenas (movimento).
Documentado no guia do benchmark.

**Por quê**: com o tempo governando a simulação, um quadro lento faria o clayflow simular até 4 passos e o Rapier 1 —
trabalho diferente, comparação injusta e "regressão" artificial contra o baseline. Mesmo tempo simulado por quadro =
mesmo trabalho, protocolo da F0 preservado (o baseline continua válido).

## R9 — Alocação da bag inteira (C2)

**Decisão**: `ResourceSystem` mantém `Map<Resource, Map<descId, Allocation>>` e aloca por papel:

| Papel                     | Origem do conteúdo                            | Alocação                                                                                       |
| ------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| uniform / storage-ro/rw   | `schema.pack(data)` (todos os `count`)        | como hoje; storage individual passa a enviar todos os elementos                                |
| vertex                    | `data[desc.id]` (typed array intercalado)     | `VertexBufferSpec` com `stride` = layout de vértice compacto do schema (A5), `STORAGE` incluso |
| index                     | `data[desc.id]` (`Uint16Array`/`Uint32Array`) | `IndexBufferSpec` com `format` derivado do tipo do array; padding a 4 bytes                    |
| indirect                  | `count × 5 u32` (draw indexed) ou `3 u32`     | `IndirectBufferSpec`, `STORAGE` incluso                                                        |
| texture / storage-texture | `textureShape`                                | `TextureSpec` (+ view); `sizeFromCanvas` recria no resize                                      |
| sampler                   | `samplerShape`                                | `SamplerSpec`                                                                                  |
| staging                   | `count × stride`                              | buffer de leitura                                                                              |

Contrato novo `ResourceDirectory` (C2, `scene/contracts`) estende `PoolDirectory` com `bufferOf(resource, descId)`,
`textureViewOf`, `samplerOf` — localização do que a C2 aloca (FR-019); consumo pelos Flows é a 006. `StructSchema`
ganha o layout de vértice compacto (atributos sem alinhamento de struct), usado como `stride` de vértice.

Também: o bind group antigo do pool é destruído no crescimento (hoje vaza); `upload` de geometria reenvia vértices e
índices quando o dado muda.

**Duplicação temporária** (decisão Q1): até a 006, desenho e sombra mantêm suas cópias; o adaptador clayflow do
benchmark declara a limitação ("geometria duplicada na GPU até a 006") e a memória medida reflete isso.

## R10 — Ciclo de vida validado

**Decisão**: toda mudança de estado passa por `ResourceSystem.transition(resource, to)`, que consulta o registry e
**lança** em transição inválida. As regras de comportamento vêm do handler do estado: `suppressCpuUpload()` bloqueia o
envio no `upload`; `ignoreDirtyMark()` no `markDirty` (o aviso de `GpuManaged` sai do handler, não de comparação).
Ciclo de reinserção: `Destroyed → Uninitialized` passa a ser transição válida (a instância removida pode voltar);
`allocate` de recurso que não está `Uninitialized` deixa de ser no-op silencioso e lança (coberto por R11).

## R11 — Reuso de instância proibido

**Decisão**: o mapa recurso → entidade passa a ser **por World** e limpo no `remove`. `World.insert` lança se: a raiz já
está inserida; algum recurso da árvore já pertence a uma raiz viva; o mesmo recurso aparece duas vezes na árvore. A
mensagem cita a regra ("crie outra instância"). O teste de idempotência (`World.test.ts:31-38`) inverte. Reinserção
após `remove` é permitida (R10).

`Application` com cena compartilhada: usa o `Time` do World (R5); registra os Flows padrão **uma vez por cena** e, no
`dispose`, desfaz o que registrou (`FlowRegistry.unregister`: remove o estágio, desfaz suas inscrições e chama `dispose`).

## R12 — Índices `uint32`

**Decisão**: `Sphere`/`Parametric`/`ParametricSurface` geram `Uint32Array` quando `vertexCount > 65535` (abaixo,
`Uint16Array`); `Geometry` expõe `indexFormat` derivado do array. Forward e sombra derivam `format` e o padding do
array (fim do cast `as Uint16Array` e do `'uint16'` fixo). `GltfLoader` amplia `UNSIGNED_BYTE` para `Uint16Array`.

## R13 — Sem nomes de classe

**Decisão**: geometria e material são reconhecidos por contrato — `instanceof Geometry` / `instanceof Material` (bases
de C3, identidade de construtor sobrevive à minificação) —, e o conjunto de renderizáveis do forward e da sombra passa
a ser mantido **por eventos** (`resourcesChanged` added/removed), não por consulta a uma lista fixa de nomes de schema
(`ForwardFlow.ts:577`, `ShadowFlow.ts:299`). Isso também elimina a consulta por quadro.

## R14 — Vazamentos

**Decisão**:

- Forward e sombra destroem, em `onEntitiesRemoved`, todos os objetos de GPU por entidade (VBO, IBO, UBOs, bind
  groups); a remoção acontece entre quadros, depois do `submit` — o WebGPU conclui o trabalho já submetido antes de
  liberar.
- `LCPFlow` destrói o buffer de donos anterior ao recriar.
- `DebugFlow.dispose` (ouvintes do EventBus e `keydown`), `InteractionSystem.detach` (remove `frameTick`),
  `FpsController.dispose` (`click`), `ExecutionSystem`/`ResourceSystem.dispose` (inscrições) chamados por
  `SceneContext.dispose`; Flows com `dispose` são descartados ao desregistrar.

## R15 — Verificação

- **CPU (Vitest)**: hash memorizado/composto/funções; congelamento; posse no store; `Time.advance` (acumulador, limite,
  pausa, escala, `droppedTime`); `step()` ≡ laço; offsets por passo; alocação por papel; transições; reuso; índices;
  renderizáveis por eventos; liberação na remoção; ouvintes no descarte.
- **Limites**: smoke `limits.ts` (despacho > 65 535 grupos com leitura de volta, SC-010; busca de vizinhança com
  262 144 células contra força bruta, SC-011).
- **Navegador**: smoke `time.ts` (trajetória a 30/60/144 Hz por `step()`, SC-003/SC-005); smoke de malha de 90 000
  vértices; smoke de ciclos insere/remove com `memoryUsage()` (SC-006).
- **Build minificado** (SC-007): o bench ganha `--dist` (alias `clayflow` → `dist/index.js`) e os smokes rodam sobre o
  dist pelo mesmo servidor do bench.
- **Desempenho** (SC-001/SC-002): `npm run bench:check` contra `bench/baselines/` + leitura das três cenas-alvo.
