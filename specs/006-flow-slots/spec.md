# Feature Specification: Slots de Flow

**Feature Branch**: `feature/006-flow-slots`

**Created**: 2026-10-12

**Status**: Implementada (2026-10-12) — pendentes: `bench:check` com a máquina livre (T068) e ratificação da
constituição 1.1.0 no PR

**Input**: User description: "Slots de Flow (spec 006, fase F1 do roadmap — `006-flow-slots`). Implementar no lugar
arquitetural certo (refundação C1–C4, `architecture_resource_loaders.md` autoritativo, com as definições corrigidas na
D5 da 005), sem helpers nem atalhos, o item 006 do ROADMAP §5 (linha F1): `Flow<TSlots,S>` com slots tipados e máquina
de estados por eventos; registro por factory `{phase, bodyType, priority}` e `unregister`; seleção de Flow por
`FlowDescriptor` feita pela C2 (`ensureFlowAllocated` → `flowReady`); `LayoutInferencer.infer` ligado; `consumes`
resolvido por `ConsumerResolver`; visibilidade inferida do WGSL; `ComputeKernelBinding` aceita vertex/index/indirect;
evento `bindGroupReplaced`; `ForwardFlow`/`ShadowFlow` consomem Camera/Material/Transform pelos slots — sem alocação
por entidade, câmera gravada uma vez por quadro, bind groups definidos uma vez por passe; `ShadowMap.schema` lido por
shader; todos os Flows existentes migrados para slots; fronteira de importação respeitada (D4); documento de
arquitetura sem inconsistências. Critérios: sem regressão no benchmark; montagem e CPU por quadro de `instances` caem;
nenhum struct duplicado TS↔WGSL; build minificado funciona; smokes inclusive com `--dist`; mesma trajetória a
30/60/144 Hz; gate completo verde."

---

## Contexto e Problema

A refundação ([arquitetura C1–C4](../../clay-engine-doc/docs/guides/architecture_resource_loaders.md)) define que um
estágio do quadro (`Flow`) **declara** o que consome — pools e Resources por nome semântico — e que a Camada 2 resolve,
aloca, infere layouts e liga os buffers; o estágio só grava passes. A 005 entregou a composição de shaders e corrigiu o
documento (D5), que agora marca explicitamente o que é "alvo da 006". O código ainda não chegou lá:

- **Estágios fazem o trabalho da C2.** Cada Flow cria à mão seus layouts, bind groups e buffers, liga cada buffer por
  índice explícito e reage a realocação de pool por callbacks próprios. As peças previstas existem mas estão
  desligadas: o `LayoutInferencer` só sabe ler o WGSL, o `ConsumerResolverRegistry` e as três estratégias
  (`Singleton`, `PerEntity`, `Pool`) não têm nenhum resolver registrado, os eventos `flowReady` e `bindGroupReplaced`
  existem no mapa de eventos e nunca são emitidos, e `PipelineDescriptor.consumes` é declarado mas ninguém lê.
- **O forward não segue a arquitetura** — é a causa principal do custo restante do benchmark (ROADMAP §6). Em vez de
  consumir o que a C2 já aloca (Camera individual, Material, Transform em pool, geometria da bag), o `ForwardFlow`
  aloca objetos de GPU por entidade, regrava a câmera em cada entidade a cada quadro e refaz os binds por draw; a
  geometria fica duplicada na GPU (cópia da C2 e cópia do estágio). O `ShadowFlow` repete o padrão, e o
  `ShadowMap.schema` não é lido por nenhum shader.
- **Registro e seleção de Flow fora do lugar.** O registro é por instância já construída; a escolha do Flow de cada
  corpo é feita por uma tabela da Application (`DEFAULT_FLOW_FACTORIES`), não pela C2 a partir do `FlowDescriptor` do
  Resource; um Flow entra no quadro sem saber se os seus pipelines compilaram ou se os seus dados estão alocados.
- **Estado interno ad hoc.** O documento define `Flow<TSlots,S>` com estado interno parametrizado e transições por
  eventos; os Flows atuais guardam flags e caches soltos e se invalidam por callbacks específicos
  (`onPoolReallocated`, `onCanvasResized`).
- **Fronteira de importação violada** (decisão D4): 24 arquivos das Camadas 3 e 4 importam `core/contracts`
  diretamente, quando deveriam usar os contratos reexportados por `scene/`.

Esta spec liga o modelo de slots de ponta a ponta e migra todos os estágios para ele. O comportamento visível não
muda: a simulação e a imagem devem ser as mesmas antes e depois; o custo de CPU do render deve cair.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Estágio declara o que consome e recebe tudo ligado (Priority: P1)

Quem escreve um estágio (do motor ou um algoritmo novo, nível N3) declara slots tipados — pools por schema, Resources
individuais, Resources da mesma entidade, alvo de render — e o pipeline com os nomes que consome. A Camada 2 resolve os
nomes, infere grupos, bindings, visibilidade e usos a partir do WGSL, cria layouts e bind groups e entrega ao estágio
os slots prontos. O estágio só grava passes. Quando um pool cresce, a C2 recria os bind groups afetados e avisa os
estágios por evento; nenhum estágio recria bind group por conta própria.

**Why this priority**: É o mecanismo que todas as outras histórias usam; sem ele, a migração do forward e dos solvers
repetiria a ligação manual.

**Independent Test**: Escrever um estágio de teste que só declara slots e um pipeline com `consumes`, inserir os
Resources e verificar que os bind groups chegam ligados com os grupos, bindings e visibilidades esperados; fazer o pool
crescer e verificar que o estágio recebe o bind group novo pelo evento e continua produzindo o mesmo resultado.

**Acceptance Scenarios**:

1. **Given** um pipeline que declara `consumes: ['Camera', 'Transform']` e um WGSL com os bindings correspondentes,
   **When** o estágio é registrado e os Resources inseridos, **Then** os bind groups são criados pela C2 com grupos,
   bindings e visibilidades inferidos do WGSL, sem nenhuma declaração manual no estágio.
2. **Given** um binding usado só no fragment, **When** o layout é inferido, **Then** a visibilidade é só fragment.
3. **Given** um nome em `consumes` sem resolver registrado, **When** o pipeline é preparado, **Then** um erro nomeia o
   nome, o estágio e os resolvers disponíveis.
4. **Given** um binding do WGSL que nenhum slot nem `consumes` cobre, **When** o pipeline é preparado, **Then** um erro
   nomeia o binding, o grupo e o estágio.
5. **Given** um pool consumido por um estágio, **When** o pool cresce, **Then** a C2 recria os bind groups dependentes,
   emite `bindGroupReplaced` com o antigo e o novo, e o estágio usa o novo no quadro seguinte sem recriar nada.
6. **Given** um descritor com binding ou visibilidade explícitos, **When** o layout é inferido, **Then** o valor
   explícito vence a inferência.

---

### User Story 2 - Forward e sombra consomem pelos slots (Priority: P1)

O render principal e o de sombra leem Camera, Material, Transform, Light, ShadowMap e a geometria pelo que a C2 já
alocou: nenhum objeto de GPU criado por entidade, câmera gravada uma vez por quadro, bind groups definidos uma vez por
passe e trocados só quando muda o que eles apontam. A geometria deixa de ser duplicada. O shader lê o `ShadowMap` pelo
seu schema.

**Why this priority**: É a causa principal do custo de CPU restante medido pelo benchmark e o critério de saída da F1.

**Independent Test**: Rodar as cenas do benchmark e os smokes de render; contar os objetos de GPU por entidade (devem
ser zero no forward e na sombra), as escritas de câmera por quadro (uma por câmera ativa) e comparar a imagem com a de
referência.

**Acceptance Scenarios**:

1. **Given** uma cena com 10 mil entidades renderizáveis, **When** é montada, **Then** o forward e a sombra não criam
   nenhum buffer, bind group nem layout por entidade.
2. **Given** uma câmera ativa, **When** um quadro é gravado, **Then** os dados da câmera são escritos uma vez.
3. **Given** um passe de forward, **When** os draws são gravados, **Then** os bind groups compartilhados (câmera, luzes,
   sombra) são definidos uma vez por passe e o de cada entidade é selecionado pelo seu slot.
4. **Given** um Material, **When** inserido, **Then** ocupa um slot no pool do seu schema e o forward o lê por esse
   slot.
5. **Given** uma geometria, **When** inserida, **Then** existe uma única cópia na GPU (a da C2), usada pelo forward e
   pela sombra.
6. **Given** um `ShadowMap`, **When** o render principal amostra a sombra, **Then** matriz da luz e vieses vêm do
   struct gerado do `ShadowMap.schema`.
7. **Given** as cenas do benchmark e do smoke de render, **When** renderizadas, **Then** a imagem é a mesma de antes.

---

### User Story 3 - Registro por factory e seleção de Flow pela Camada 2 (Priority: P1)

Estágios são registrados por factory com fase, tipo de corpo e prioridade; podem ser removidos. Quando um Resource com
`FlowDescriptor` é inserido, a Camada 2 escolhe o Flow do seu tipo de corpo, garante que ele esteja alocado (pipelines
compilados, slots resolvidos) e só então o anuncia como pronto; o quadro executa apenas Flows prontos. O auto-registro
de solvers por tabela na Application deixa de existir.

**Why this priority**: Fecha o ciclo declarativo (Resource declara o algoritmo, C2 seleciona e prepara) e é o que
permite trocar ou acrescentar solvers sem tocar no motor.

**Independent Test**: Registrar factories para dois algoritmos do mesmo tipo de corpo com prioridades diferentes,
inserir corpos de cada algoritmo e verificar quem foi instanciado, em que ordem rodam, que `flowReady` só é emitido
depois da compilação e que `unregister` libera tudo.

**Acceptance Scenarios**:

1. **Given** uma factory registrada com `{ phase, bodyType, priority }`, **When** nenhum corpo do tipo existe, **Then**
   nenhum Flow é instanciado nem alocado.
2. **Given** o primeiro corpo de um tipo inserido, **When** a C2 processa a inserção, **Then** o Flow é instanciado,
   seus pipelines são preparados e `flowReady` é emitido só depois; até lá o quadro não o executa.
3. **Given** dois Flows para o mesmo tipo de corpo, **When** resolvidos, **Then** vence a maior prioridade, empate para
   o último registrado — a regra única do documento.
4. **Given** um Flow registrado, **When** removido, **Then** seus objetos de GPU e inscrições em eventos são liberados e
   ele não roda mais.
5. **Given** um corpo com algoritmo declarado no `FlowDescriptor`, **When** inserido, **Then** entra no pool
   `${schema}:${algoritmo}` (ou do schema, quando o algoritmo não é declarado) e é atendido pelo Flow desse algoritmo.

---

### User Story 4 - Estado de Flow por máquina de estados e eventos (Priority: P2)

Cada Flow tem um estado interno tipado; o estado muda só em reação a eventos (slots prontos, pool realocado, bind group
substituído, canvas redimensionado, entidades inseridas ou removidas) e nunca por chamada pública. A gravação do quadro
(`dispatch`) é o único ponto que grava comandos e não muda estado de preparação.

**Why this priority**: Elimina os caches e flags soltos e os callbacks específicos, que são a fonte de bugs de
invalidação; é o contrato que o documento promete a quem escreve um Flow.

**Independent Test**: Para cada Flow do motor, enumerar os estados e as transições, provocar cada evento em teste com
slots e quadro simulados e verificar o estado resultante; verificar que transições inválidas lançam com o estado e o
evento.

**Acceptance Scenarios**:

1. **Given** um Flow com slots ainda não resolvidos, **When** o quadro é gravado, **Then** o Flow não grava nada e não
   está entre os prontos.
2. **Given** um Flow pronto, **When** chega `bindGroupReplaced` de um pool que ele consome, **Then** ele passa a usar o
   novo bind group sem voltar a preparar pipelines.
3. **Given** um Flow com texturas do tamanho do canvas, **When** o canvas é redimensionado, **Then** as texturas e os
   bind groups que as referenciam são recriados antes do próximo uso, sem uso de objeto destruído.
4. **Given** um evento que não leva a nenhuma transição válida a partir do estado atual, **When** recebido, **Then** um
   erro nomeia o Flow, o estado e o evento.

---

### User Story 5 - Todos os estágios do motor migrados (Priority: P2)

Os seis solvers (LCP, XPBD, FEM, MPM, SPH, PBF), o `TransformFlow`, a sombra, o forward, o pós-processamento, a UI e o
debug usam slots, `consumes` e os bind groups da C2. Os kernels genéricos e a busca de vizinhança aceitam também
buffers de vértice, índice e indireto como bindings de compute, para que um estágio possa escrever neles.

**Why this priority**: Um modelo pela metade mantém dois caminhos; a F2 (pools de cena e instancing) parte de todos os
estágios no modelo de slots.

**Independent Test**: Varrer os estágios e verificar que nenhum cria layout ou bind group de dado consumido por conta
própria; rodar os smokes de trajetória a 30, 60 e 144 Hz contra as fixtures e conferir a igualdade.

**Acceptance Scenarios**:

1. **Given** qualquer estágio do motor, **When** inspecionado, **Then** os dados que ele consome chegam por slot ou
   `consumes`; recursos privados do algoritmo (temporários, uniforms por passo) continuam do estágio.
2. **Given** as sete cenas de física do smoke de trajetórias, **When** simuladas a 30, 60 e 144 Hz, **Then** as
   trajetórias são idênticas às fixtures (ou dentro da tolerância registrada na 005).
3. **Given** um kernel de compute que escreve num buffer de vértices, índices ou indireto, **When** criado, **Then** o
   binding é aceito e o buffer é usável pelo render no mesmo quadro.

---

### User Story 6 - Fronteira de importação e documento fiéis (Priority: P3)

As Camadas 3 e 4 importam contratos só por `scene/` (decisão D4), e uma verificação automática no gate garante isso. O
documento de arquitetura descreve o modelo de slots como estado atual, sem marcas de "alvo da 006" remanescentes nem
exemplos que não compilam com a API pública.

**Why this priority**: Fecha a F1 e evita que o próximo trabalho volte a importar a Camada 1 por atalho.

**Independent Test**: Rodar a verificação de fronteira (que falha ao introduzir um import proibido) e conferir que o
documento não tem mais "alvo da 006" e que seus exemplos usam só a API exportada.

**Acceptance Scenarios**:

1. **Given** um arquivo de C3/C4 que importa `core/` diretamente, **When** o gate roda, **Then** falha nomeando o
   arquivo.
2. **Given** o documento de arquitetura, **When** revisado, **Then** cada item marcado "alvo da 006" está descrito como
   estado atual e os exemplos de Flow, `register` e `consumes` correspondem à API.

---

### Edge Cases

- Pool que cresce no meio da preparação de um Flow (antes de `flowReady`): o Flow é preparado com o bind group final,
  sem usar o antigo.
- Último corpo de um tipo removido: o Flow continua registrado, sem trabalho; o pool vazio não dispara despacho com
  contagem 0.
- Dois tipos de corpo atendidos pelo mesmo algoritmo (o XPBD é genérico sobre o corpo): o mesmo Flow recebe o pool
  certo em cada slot.
- Nenhuma câmera na cena: forward e sombra não ficam prontos e não gravam nada; não é erro.
- Entidade com Geometry e Transform mas sem Material: não é renderizável; não gera draw nem aviso repetido por quadro.
- Material trocado em tempo de execução para outro schema: a entidade muda de pool e o forward passa a lê-la no novo
  slot no quadro seguinte.
- Pipeline compilado de forma assíncrona: o Flow só entra no quadro após a compilação; quadros anteriores não
  apresentam lixo.
- Resolver registrado depois de o pipeline ser declarado: a preparação aguarda o resolver ou falha com erro claro na
  primeira tentativa de uso, nunca liga um binding vazio.
- Canvas redimensionado no mesmo quadro em que um pool cresce: os dois eventos são tratados e nenhum objeto destruído é
  referenciado.
- Unregister de um Flow cujo pipeline ainda compila: a compilação concluída depois não o reativa.
- Build minificado: nomes de slots, resolvers e schemas são dados explícitos, nunca nomes de classe.

## Requirements _(mandatory)_

### Functional Requirements

**Flow com slots e estado**

- **FR-001**: `Flow` MUST ser parametrizado pelos seus slots e pelo seu estado interno; os slots MUST ser declarados de
  forma tipada (pool por schema, Resource individual, Resource da mesma entidade, alvo de render) e resolvidos pela
  Camada 2, nunca pelo próprio estágio.
- **FR-002**: O estado interno de um Flow MUST mudar só em reação a eventos do barramento; não MUST existir método
  público de avanço de estado; transição inválida MUST lançar com Flow, estado e evento.
- **FR-003**: `dispatch(frame)` MUST ser o único ponto de gravação de comandos e MUST NOT preparar pipelines, layouts
  nem bind groups de dados consumidos.
- **FR-004**: Os callbacks específicos atuais de invalidação (`onPoolReallocated`, `onCanvasResized`,
  `onEntitiesInserted`, `onEntitiesRemoved`, `onEvent`) MUST ser substituídos pelas transições por evento.
- **FR-005**: `RenderFlow` MUST pré-declarar o slot de alvo de render, resolvido como os demais slots (canvas,
  shadow map, alvo de pós-processamento).

**Registro e seleção**

- **FR-006**: O registro MUST ser por factory com `{ phase, bodyType?, priority? }`; `unregister` MUST liberar os
  objetos de GPU e as inscrições do Flow. A ordem de execução MUST seguir a regra única do documento (fases fixas;
  prioridade decrescente; empate pela ordem de registro).
- **FR-007**: A seleção do Flow de um Resource MUST ser feita pela Camada 2 a partir do seu `FlowDescriptor`
  (`ensureFlowAllocated`): instanciar pela factory na primeira necessidade, preparar pipelines e slots e emitir
  `flowReady`. A tabela de auto-registro da Application MUST deixar de existir; os solvers padrão MUST ser registrados
  como factories.
- **FR-008**: O quadro MUST executar só Flows prontos (que receberam `flowReady` e não foram removidos).
- **FR-009**: O pool de um corpo MUST ser `${schema.name}:${algoritmo}` quando o Resource declara algoritmo, senão
  `${schema.name}`.

**Inferência e resolução**

- **FR-010**: `LayoutInferencer.infer` MUST produzir, a partir da bag do Resource ou do estágio e do WGSL montado
  (`composeWgsl`), os layouts, bindings, visibilidades e usos; a visibilidade MUST ser a união dos estágios de shader
  que usam o binding.
- **FR-011**: `consumes` MUST ser resolvido pelo `ConsumerResolverRegistry`; o motor MUST registrar resolvers para
  `Camera` (singleton ativo), `Transform`/`WorldTransform` (pool), `Material` (pool por schema), `Light`, `ShadowMap`,
  colliders, `ParticleMaterial`, `GravityField` e os pools de corpos e restrições; aplicações MUST poder registrar
  resolvers próprios.
- **FR-012**: Binding do WGSL não coberto por slot nem `consumes`, nome de `consumes` sem resolver e incompatibilidade
  de tipo entre o binding e o recurso resolvido MUST falhar na preparação com mensagem que nomeia binding, grupo,
  estágio e nome.
- **FR-013**: Campos explícitos de binding, visibilidade ou layout em descritores MUST vencer a inferência.
- **FR-014**: Ao crescer um pool, a Camada 2 MUST recriar os bind groups que o referenciam e emitir
  `bindGroupReplaced { poolKey, oldSpec, newSpec }`; os estágios MUST trocar o bind group em reação ao evento.
- **FR-015**: Bindings de compute MUST aceitar buffers de vértice, índice e indireto.

**Forward e sombra**

- **FR-016**: Forward e sombra MUST NOT criar buffer, bind group ou layout por entidade; os dados de entidade MUST vir
  dos pools e Resources alocados pela Camada 2, selecionados pelo slot da entidade.
- **FR-017**: Os dados de cada câmera ativa MUST ser escritos uma vez por quadro.
- **FR-018**: Bind groups compartilhados de um passe MUST ser definidos uma vez por passe; os por entidade, trocados só
  quando mudam.
- **FR-019**: Material MUST ser coalescido em pool por schema (definição do documento, D5); o forward MUST lê-lo pelo
  slot do material.
- **FR-020**: Geometria MUST existir uma vez na GPU (alocação da Camada 2), consumida por forward e sombra.
- **FR-021**: O shader do forward MUST ler matriz da luz e vieses da sombra pelo struct gerado do `ShadowMap.schema`.

**Migração, fronteira e documento**

- **FR-022**: Todos os estágios do motor (LCP, XPBD, FEM, MPM, SPH, PBF, Transform, sombra, forward, pós, UI, debug)
  MUST consumir dados por slots e `consumes`; recursos privados do algoritmo continuam do estágio.
- **FR-023**: Os kernels genéricos da 005 e a busca de vizinhança MUST continuar utilizáveis por estágios com slots,
  recebendo os buffers dos slots.
- **FR-024**: As Camadas 3 e 4 MUST importar contratos só por `scene/`; uma verificação automática no gate MUST falhar
  ao detectar import direto de `core/` nessas camadas.
- **FR-025**: O documento de arquitetura MUST descrever o modelo de slots como estado atual; nenhuma marca "alvo da
  006" MUST restar; os exemplos MUST usar só a API pública.
- **FR-026**: A API removida (registro por instância, callbacks específicos, tabela de auto-registro) MUST constar do
  guia de migração com o equivalente novo.

**Preservação**

- **FR-027**: A simulação MUST produzir a mesma trajetória antes e depois, a 30, 60 e 144 Hz (bit a bit, ou dentro da
  tolerância registrada na 005).
- **FR-028**: A imagem renderizada das cenas do benchmark e do smoke de render MUST ser a mesma antes e depois.
- **FR-029**: Nenhum struct MUST ser duplicado entre TypeScript e WGSL (verificação da 005 mantida).
- **FR-030**: O build minificado MUST funcionar: nomes de slots, resolvers, pools e schemas são dados explícitos.

### Key Entities

- **Slot de Flow**: referência tipada a um dado consumido — pool por schema, Resource individual, Resource da mesma
  entidade ou alvo de render; resolvido pela Camada 2, com estado (pendente, pronto) e o bind group corrente.
- **Estado de Flow**: valor do tipo `S` de cada Flow (ex.: aguardando slots, preparando pipelines, pronto) com a tabela
  de transições por evento.
- **Factory de Flow**: construtor registrado com fase, tipo de corpo e prioridade; instanciado pela Camada 2 sob
  demanda.
- **ConsumerResolver**: estratégia que traduz um nome de `consumes` em entradas de bind group (singleton, por entidade,
  pool ou do usuário).
- **Layout inferido**: grupos, bindings, visibilidades e usos derivados do WGSL montado e da bag.
- **Pool de Material**: buffer de materiais por schema, com slot estável por entidade.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 0 objetos de GPU criados por entidade no forward e na sombra (contados em teste com 10 mil entidades).
- **SC-002**: 1 escrita de dados de câmera por câmera ativa por quadro.
- **SC-003**: CPU por quadro de `instances/10k` cai pelo menos 30% e o tempo de montagem de `instances/10k` cai contra o
  baseline vigente; `bench:check` sem regressão nas demais cenas.
- **SC-004**: 0 estágios do motor criam layout ou bind group para dado consumido (verificação no gate).
- **SC-005**: 0 imports diretos de `core/` em C3/C4 (verificação no gate); hoje são 24 arquivos.
- **SC-006**: Trajetórias idênticas às fixtures (ou na tolerância da 005) nas sete cenas de física, a 30, 60 e 144 Hz.
- **SC-007**: Imagens das cenas de render idênticas às de referência.
- **SC-008**: 0 marcas "alvo da 006" no documento de arquitetura.
- **SC-009**: Gate completo verde; build minificado funciona; todos os smokes passam, inclusive com `--dist`.

## Assumptions

- O baseline vigente do benchmark é o regravado na 004; se a 005 regravar o baseline após a T084, a 006 mede contra o
  novo. A meta de 30% em `instances/10k` vem da atribuição do custo restante ao forward por entidade (ROADMAP §6).
- Sem instancing nem vertex pulling nesta spec (F2): o forward ainda emite um draw por entidade, mas seleciona os
  dados pelo slot da entidade (offset dinâmico ou índice), sem objetos próprios por entidade.
- Camera continua individual (uma por câmera); Transform continua em pool; Material passa a pool por schema, como o
  documento definiu na D5.
- O registro por instância e os callbacks específicos são removidos sem camada de compatibilidade (motor anterior à
  1.0); o guia de migração registra o equivalente.
- A 005 (PR #37) é integrada em `develop` antes desta; o branch parte de `feature/005-shader-modules` e o PR vai para
  `develop` depois do merge da 005.
- A seleção de Flow por algoritmo usa os schemas atuais (cada algoritmo com o seu schema); o caminho
  `${schema}:${algoritmo}` passa a funcionar para Resources que declararem algoritmo.

## Out of Scope

- Pools de Transform/Camera/Light/Material/`Renderable` consumidos por vertex pulling, instancing, draws agrupados e
  fim do readback da física (F2/007).
- Geometria produzida em compute e render de partículas e corpos moles (008).
- Pontos de extensão matemáticos do usuário (F3).
- Lacunas de física P1–P10 e limites E1–E4 de [PENDENCIAS.md](../PENDENCIAS.md) (F5).
