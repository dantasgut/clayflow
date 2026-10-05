# Research — 003 Transformações reativas (Fase 0)

Decisões que resolvem as incógnitas do Technical Context. Formato: Decisão / Racional / Alternativas. Referências
`arquivo:linha` são do código em `develop` (c0eef3b).

---

## R1 — Marcação automática de sujo: proxy profundo instalado na alocação

- **Decisão**: o `ResourceSystem`, ao alocar um recurso (`allocate`, disparado por `resourcesChanged`), substitui
  `resource.data` por um **proxy reativo** que emite a marcação de sujo daquele recurso em:
  - `set`/`deleteProperty` de qualquer campo de `data`;
  - escrita indexada em campos vetoriais (`Array` e `TypedArray`), via proxy aninhado criado **sob demanda** no `get`
    e cacheado em `WeakMap` (a mesma referência de array devolve sempre o mesmo proxy);
  - métodos mutadores de `TypedArray` (`set`, `fill`, `copyWithin`, `sort`, `reverse`) e de `Array` que não passam
    pelos traps de índice da mesma forma (`splice`, `fill`, `copyWithin`, `sort`, `reverse`) — envolvidos para marcar
    sujo após executar no alvo.
  - Valores que não são campos de schema (ex.: `_initialBytes`, `vertices`/`indices` de geometria, que o
    `ResourceSystem` não envia) passam pelo proxy sem custo extra: marcar sujo nesses casos é inofensivo (o reenvio só
    empacota campos do schema).
- **Racional**: é o mecanismo que o desenho da refundação prevê ("mutação direta — emite resourceDirty … Proxy ou
  setter", `architecture_resource_loaders.md:3979-3991`) e funciona para **todo** recurso sem tocar cada classe. A
  instalação na alocação garante que só recursos inseridos na cena reajam (FR-004).
- **Limite documentado**: referências a arrays internos capturadas **antes** da inserção (`const p = t.data.position`
  e depois `p[0] = 1`) não são rastreadas — o guia orienta a mutar via `t.data.position[0] = …` ou reatribuir.
- **Alternativas**: setters explícitos por classe (boilerplate em ~40 classes de recurso, fácil esquecer);
  `markDirty()` manual (é o problema atual — chamadas manuais e acesso privado no `LCPFlow.ts:692-701`); comparação
  por hash a cada quadro (custo proporcional ao número de recursos, mesmo sem mudanças).

## R2 — Coalescência: fila de sujos esvaziada num evento explícito antes da gravação do quadro

- **Decisão**: o tratamento de `resourceDirty` (automático ou manual) passa a **enfileirar** o recurso num `Set`. O
  `ExecutionSystem` emite um novo evento **`frameRecording`** no início de `onFrameTick`, antes de `core.record`; o
  `ResourceSystem` reage esvaziando a fila: um único `write` por recurso sujo, com o valor corrente, e um
  `resourceReady` por recurso enviado.
- **Racional**: atende FR-002/SC-004 (N mutações → 1 envio) e mantém o modelo reativo da refundação ("ResourceSystem
  não tem método flush — é reativo", doc L4241). A ordem é **explícita** (evento emitido antes do record), não
  dependente da ordem de inscrição de handlers — Princípio IV.
- **Alternativas**: envio imediato (atual, `ResourceSystem.ts:107-118` — N writes); `flush()` público chamado pelo
  `ExecutionSystem` (acoplamento imperativo que o desenho removeu); depender de `ResourceSystem` assinar `frameTick`
  antes do `ExecutionSystem` (ordem implícita por construção em `SceneContext.ts:57-58`).

## R3 — Política de envio por descritor (`upload`) e estado `GpuManaged`

- **Decisão**: `GPUDescriptor` ganha `upload?: 'always' | 'initial' | 'never'` (default `'always'`):
  - `'always'` — CPU envia na alocação e a cada sujo (comportamento atual);
  - `'initial'` — CPU envia só na alocação; depois o recurso transita `Ready → GpuManaged` (transição já válida,
    `ReadyResourceStateHandler.ts:25`), cujo handler ignora marcas de sujo (`GpuManagedResourceStateHandler.ts:22`);
    mutação nesse estado gera **um aviso** por classe de recurso (orienta que a GPU é dona do dado);
  - `'never'` — buffer produzido só pela GPU; nunca escrito pela CPU (nem na alocação, nem no crescimento do pool).
  - Os pools de corpos simulados — descritores de `RigidBody`, `SoftBody` e `FluidBody` (schemas `LCPSchema`,
    `XPBDRigidSchema`, `XPBDSoftSchema`, `FEMSchema`, `MPMSoftSchema`, `SPHSchema`, `PBFSchema`, `MPMFluidSchema`) —
    declaram `'initial'`: a simulação é dona do estado depois do spawn. Colisores, restrições e luzes não são escritos
    pela GPU e continuam `'always'`.
- **Racional**: FR-003. Com a marcação automática, qualquer mutação acidental de um corpo físico reescreveria o estado
  simulado com o valor inicial da CPU — a política por descritor evita isso e realiza o `GpuManaged` do desenho
  ("Ready→GpuManaged via enterGpuManagedMode (ex.: compute escreve no buffer)", doc L1781). Recursos mistos (o
  `Transform`: intenção `'always'` + matriz `'never'`) continuam `Ready`, porque a política vale por descritor.
- **Alternativas**: estado `GpuManaged` por recurso inteiro (não serve ao `Transform`, que tem parte CPU e parte GPU);
  Flows trocarem o estado imperativamente (o desenho proíbe transições imperativas, doc L1757); não proteger (regressão
  silenciosa na física).

## R4 — `Transform` como intenção + matriz de mundo como segundo descritor do mesmo recurso

- **Decisão**:
  - `Transform.schema` = `StructSchema('Transform', { position: vec4f, rotation: vec4f, scale: vec4f })` — intenção,
    descritor `{ id: 'transform', role: 'storage-ro', storage: 'pool', upload: 'always' }` (pool `Transform`, stride 48).
  - `Transform.worldSchema` = `StructSchema('WorldTransform', { world: mat4x4f, normal: mat3x3f })` — produto,
    descritor `{ id: 'world', role: 'storage-rw', storage: 'pool', upload: 'never' }` (pool `WorldTransform`, stride 112).
  - `model` sai do schema e do `data`. Construtor que receber `model` emite **um aviso por execução** e ignora o valor
    (FR-007).
- **Slot comum**: o `ResourceSystem` passa a atribuir **um slot por recurso** e usá-lo em todos os pools que o recurso
  declara (o slot do primeiro pool define; os demais pools crescem para cobri-lo). Assim `Transform[i]` e
  `WorldTransform[i]` são sempre a mesma entidade, inclusive após remoções e crescimento. O crescimento de um pool
  `'never'` não reempacota dados da CPU (não há): emite `poolReallocated` e quem produz o dado o recalcula.
- **Racional**: a matriz de mundo é produto de um estágio (não dado do usuário), vive na GPU e é coalescida em pool
  como o desenho manda (Resource como contrato único de dado GPU — Princípio III). Ficar no mesmo recurso evita criar
  entidades/recursos auxiliares escondidos e mantém a indexação por slot trivial para os consumidores.
- **Alternativas**: manter `model` no `Transform` e calculá-lo na CPU (é o "helper" rejeitado e não abre caminho para o
  estágio em GPU nem para cadeias não euclidianas); um recurso `WorldTransform` separado anexado automaticamente
  (composição implícita, criticada no próprio `RigidBody`); compor TRS no vertex shader (sem estágio substituível, sem
  ponto de extensão futuro, recomputa por vértice).

## R5 — `TransformFlow`: estágio de compute numa fase explícita `transform`

- **Decisão**:
  - Nova fase **`transform`** em `PHASE_ORDER`, entre `physics` e `shadow` (`FlowRegistry.ts:12`, tipo `Phase` em
    `Flow.ts:10`) — fases futuras (`space`, F6) entram da mesma forma.
  - `TransformFlow` em `src/elements/scene/flows/TransformFlow.ts` (C3, ao lado do `Transform`), registrado por padrão
    em `registerPresentationDefaults` (onde os estágios padrão são registrados hoje), substituível por outro Flow na
    mesma fase.
  - Kernel `transform_compose.wgsl` (um thread por slot, `@workgroup_size(64)`): lê `Transform[i]`, normaliza o
    quaternion, compõe `world = T·R·S` (convenção `M = T·R·S` de `notes/math.md`) e `normal = R·S⁻¹` (inversa-transposta
    de `R·S`, com recíproco seguro para escala 0), escreve `WorldTransform[i]`. Reusa `mat3_from_quat` de
    `math/mat.wgsl`. Bindings: `Transform` (read-only storage), `WorldTransform` (storage), parâmetros `{ count }`
    (uniform).
  - **Reativo**: o Flow recebe o `EventBus` e marca `needsDispatch` ao receber `resourceReady` de um recurso do pool
    `Transform` (identificado pelo pool key via contrato, não por nome de classe) e `poolReallocated` de `Transform`/
    `WorldTransform`; sem marca, `dispatch` não grava nada (FR-011). Nesta feature o dispatch cobre o pool inteiro; lista
    de slots sujos fica para a F2.
- **Racional**: FR-008–FR-011; ordem por fase declarada (Princípio IV); estágio substituível — base para `Parent` (F2),
  ponto de extensão `transform` (F3) e cadeia não euclidiana (F6), sem que os consumidores mudem.
- **Alternativas**: rodar na fase `physics` com prioridade menor (semântica errada e ordem implícita por prioridade);
  executar sempre todo quadro (custo fixo desnecessário em cena estática); CPU (rejeitado — decisão do autor).

## R6 — Desenho e sombra consomem a matriz por slot, via `instance_index`

- **Decisão**:
  - `forward.wgsl` e `shadow_depth.wgsl` trocam `var<uniform> transform: Transform` por
    `@group(1) @binding(0) var<storage, read> worlds: array<WorldTransform>`; o vertex shader usa
    `@builtin(instance_index)` para indexar; o desenho chama `pass.draw.indexed(count, 1, 0, 0, slot)` (firstInstance =
    slot — não exige feature, `Drawer.ts:5-11`).
  - Forward e sombra criam **um** layout (read-only storage, visibilidade vértice) e **um** bind group apontando para o
    buffer do pool `WorldTransform`, recriado em `onPoolReallocated('WorldTransform')` (hoje no-op em
    `ForwardFlow.ts:165-169`). Somem o buffer de transform por entidade e o `write` por entidade por quadro
    (`ForwardFlow.ts:552-563,658`, `ShadowFlow.ts:351-392`).
  - Normais: `out.world_normal = worlds[i].normal * in.normal` (corrige escala não uniforme, FR-013).
  - Escala com determinante negativo (espelhamento): o forward e a sombra escolhem a variante de pipeline com
    `frontFace: 'cw'` quando `sx·sy·sz < 0` (sinal lido da intenção na CPU), mantendo o culling correto.
- **Racional**: FR-012/FR-013/SC-005; `instance_index` prepara o instancing da F2 sem custo agora.
- **Alternativas**: uniform com dynamic offset (exige cópia GPU→uniform ou layout duplicado); `discard`/sem culling para
  escala negativa (perde desempenho e esconde o problema).

## R7 — Contrato de consulta a pools para C3/C4

- **Decisão**: novo contrato `PoolDirectory` em `src/scene/contracts/` com o subconjunto de leitura que estágios usam —
  `poolBufferSpec(key)`, `poolCount(key)`, `poolSlotOf(key, id)`, `poolKeyForResource(r)` — implementado pelo
  `ResourceSystem`. `TransformFlow` e as partes novas de forward/sombra dependem do contrato, não da classe.
- **Racional**: Princípio I (C3/C4 importam contratos de `scene/contracts`); avança a decisão D4 sem migrar agora os
  Flows de física (que continuam importando `ResourceSystem` até a spec 006).
- **Alternativas**: importar `ResourceSystem` (viola Princípio I, como fazem os Flows de física hoje).

## R8 — Física publica pose pelo mecanismo reativo

- **Decisão**: `LCPFlow.applyTransformsFromReadback` passa a atribuir apenas `transform.data.position` e
  `transform.data.rotation` (o proxy marca sujo); remove a construção da matriz (`LCPFlow.ts:652-689`), o
  `markTransformDirty` com cast em `world.events` (`:692-701`) e a busca por `constructor.name === 'Transform'` (troca
  por `instanceof Transform`). A escala do desenvolvedor deixa de ser forçada a 1.
- **Racional**: FR-005/FR-014/FR-015; a cópia GPU→CPU continua até a F2 (spec 007).
- **Alternativas**: física escrever direto o pool `Transform` na GPU agora (é o escopo da F2 — exige o contrato de
  buffers entre Flows).

## R9 — Verificação

- **Vitest (CPU)**: proxy reativo (campo, componente, arrays e typed arrays, métodos mutadores, delete, referência
  estável do proxy aninhado, recurso não inserido/removido); coalescência (10 mutações → 1 `write`, envio no
  `frameRecording`); política `upload` (`always`/`initial`/`never`, transição para `GpuManaged` e aviso único); slot
  comum entre pools do mesmo recurso sob inserção/remoção/crescimento; `Transform` sem `model` + aviso; ordem de fases
  com `transform`; `TransformFlow` só despacha quando marcado (core mockado); forward/sombra desenham com
  `firstInstance = slot` e escolhem `frontFace` pelo sinal da escala (passes mockados); oráculo CPU de `T·R·S` e
  `R·S⁻¹` **dentro do teste** para validar a matemática do kernel por readback no smoke.
- **Smoke de navegador** novo `src/__smokes__/transforms.ts`: cena com cubos em posições/rotações/escalas variadas
  (inclui escala não uniforme e negativa); (1) readback do pool `WorldTransform` comparado ao oráculo (tolerância
  1e-5); (2) amostragem de pixels do alvo offscreen nos centros projetados (cada cubo com cor distinta, tolerância de
  1 px — SC-001); (3) mutação de `data.position` reflete no quadro seguinte (SC-003); (4) cena de corpos rígidos com
  escala visual ≠ 1 preservada (SC-006). Mais os smokes existentes (`integration`, `multiApp`, `stress60s`) sem
  regressão, e os exemplos do README executados.

## R10 — Documentação

- **Decisão**: atualizar README (exemplos passam a funcionar como escritos), `getting_started.md`, guia de migração
  (seção "Mudança incompatível: `Transform.model` removido"), guia de arquitetura (Transform só intenção; mutação
  reativa **implementada**; política `upload` e `GpuManaged`; fase `transform`; resolução da lacuna "quem converte
  Transform em matriz" — o `TransformFlow`) e JSDoc de todos os exports novos/alterados. Notas de versão no guia de
  migração (não há CHANGELOG — TODO(VERSIONING) da constituição).
