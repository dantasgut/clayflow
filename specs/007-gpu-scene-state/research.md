# Research: Estado de cena na GPU e paridade de desempenho com o Three.js

**Spec**: [spec.md](./spec.md) · **Plano**: [plan.md](./plan.md)

## Achados (código em `develop`, `2556ac9`)

| #   | Achado                                                                                                                                                                                                                                                                                                  | Evidência                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A1  | Geometria tem um buffer por entidade: o discriminador inclui a identidade da entidade, então a deduplicação por spec da C1 nunca acontece. Cada `BoxGeometry`/`SphereGeometry` gera os seus arrays no construtor (840 B por caixa; ~13 KB por esfera de 16×32), também por instância                    | `ResourceSystem.ts:558-590` (`createGeometryBuffer`, `identityOf`); `BoxGeometry.ts:23-37` |
| A2  | O forward grava um `drawIndexed` por entidade com `setVertexBuffer`/`setIndexBuffer` a cada uma, percorrendo todas as entidades na CPU a cada quadro; a sombra repete                                                                                                                                   | `ForwardFlow.ts:247-302`; `ShadowFlow.ts:166-207`; `GpuRenderPass.ts:65-75`                |
| A3  | O envio de pool acha o slot do Resource por varredura linear de `entry.occupants` — O(N) por envio, O(N²) com todos sujos; o mesmo na liberação. Um `core.write` por Resource. Cada envio emite `resourceReady`, repassado a todos os runtimes, que chamam `getDescriptors()` (array novo) para filtrar | `ResourceSystem.ts:892-900`, `:915-933`; `FlowBinder.ts:53-60`                             |
| A4  | O crescimento de pool `'always'` reempacota todos os ocupantes na CPU                                                                                                                                                                                                                                   | `ResourceSystem.ts:775-782`                                                                |
| A5  | O LCP lê o pool inteiro de corpos de volta a cada quadro (`mapAsync`), captura um array slot→entidade de tamanho N por quadro e reatribui `transform.data.position/rotation` na CPU, que é reenviado e recomposto: um quadro de atraso e picos quando a leitura espera                                  | `LCPFlow.ts:429-434`, `:668-759`                                                           |
| A6  | A narrowphase despacha `bodyCount × poolCount` invocações por pool de forma e por substep (4 por passo)                                                                                                                                                                                                 | `rb_narrowphase.wgsl:344-348`; `LCPFlow.ts:401-410`                                        |
| A7  | O solve do LCP é Jacobi por contato com somas em ponto fixo por atomics inteiros (spec 004, R19): o resultado não depende da ordem dos contatos, só do conjunto. Os contatos já são reservados por `atomic_alloc` (ordem não determinística hoje) e as trajetórias são bit a bit                        | `specs/004-core-hardening/research.md` R19; `rb_narrowphase.wgsl:127`                      |
| A8  | A busca de vizinhança da 005 (`NeighborSearchPipeline`: grade uniforme limitada, contagem, prefix sum, scatter, busca em 27 células, ≤ 128 vizinhos) é usada por SPH/PBF e não pelo LCP                                                                                                                 | `elements/gpu/NeighborSearchPipeline.ts`; `ns_*.wgsl`                                      |
| A9  | Câmera: schema com matrizes, descritor uniform individual; as matrizes vêm da CPU (três controllers com a mesma matemática; o bench e os smokes calculam por conta própria); sem `Transform`; `aspect` não segue o canvas                                                                               | `Camera.ts:16-46`; `OrbitController.ts:104-203`; `bench/engines/clayflow.ts:16-89`         |
| A10 | `Input` é estado JS da C4 (`presentation/input/Input.ts`), fora do World; o `InteractionSystem` chama `controller.update({ input, dt })`                                                                                                                                                                | `Input.ts:34-63`; `InteractionSystem.ts:58-100`                                            |
| A11 | Pool `Light` existe e nenhum WGSL o lê; a direção chega por `ForwardFrameParams` escrito pela CPU; a matriz da sombra é uma ortográfica ±10 calculada na CPU e gravada em `ShadowMap.data.lightViewProj`                                                                                                | `Light.ts:32-41`; `ForwardFlow.ts:378-401`; `ShadowFlow.ts:237-254`                        |
| A12 | Não há `Parent`; `TransformFlow` compõe TRS por slot sobre todo o pool quando algo mudou                                                                                                                                                                                                                | `TransformFlow.ts:87-121`; `transform_compose.wgsl`                                        |
| A13 | Para 1 milhão de entidades: ~2 milhões de buffers de geometria e ~840 MB de arrays de vértice em JS (A1), 1 milhão de draws gravados por quadro (A2), mais estruturas por entidade nos runtimes                                                                                                         | A1, A2; `FlowRuntime.ts:598-623`                                                           |
| A14 | A C1 já deduplica objetos por hash de spec com posse por spec (`retain`/`release`): o objeto só é destruído quando a última spec dona sai                                                                                                                                                               | `GpuResourceStore.ts:28-100`                                                               |
| A15 | As cenas de render do smoke são estáticas e sem física; a câmera e a sombra delas vêm de matrizes calculadas em `f64` na CPU                                                                                                                                                                            | `src/__smokes__/render.ts:48-96`                                                           |

## Decisões

### R1 — Dedup de geometria por chave de conteúdo, com a posse da C1

**Decisão**: `Geometry` expõe `contentKey: string`. As geometrias paramétricas (`Box`, `Sphere`, `Plane`,
`Parametric*`) derivam a chave dos parâmetros (`BoxGeometry:1,1,1`); a geometria genérica com arrays do usuário
deriva de um hash dos bytes de vértice e índice (FNV-1a de 64 bits sobre os bytes, com comparação de bytes em colisão
de hash). O discriminador dos buffers de vértice e índice passa a ser `${desc.id}:${schema}:${contentKey}`: duas
entidades com o mesmo conteúdo produzem a mesma spec, e a C1 devolve o mesmo objeto com posse por spec (A14) — a
liberação da última dona destrói. O conteúdo é escrito só quando a spec é criada (não em `retain`).

Os arrays das paramétricas deixam de ser gerados no construtor: são produzidos sob demanda pela chave, uma vez por
chave, num cache de conteúdo imutável da própria classe (arrays congelados por `Object.freeze` sobre a vista; quem
precisa mudar vértices cria uma geometria genérica). Isso tira os ~840 MB de `instances/1m` (A13).

**Mutação**: atribuir `data.vertices`/`data.indices` numa geometria inserida recalcula a chave; se mudou, a entidade
solta a spec antiga e adquire a nova (copy-on-write por spec) e o grupo de draw dela muda (R3). Mudar o conteúdo de um
array no lugar não é detectado (como hoje) e é documentado como proibido para geometria compartilhada.

**Alternativas rejeitadas**: hash de bytes para todas (custa ~1 s de CPU em 1m caixas e mantém os arrays por
instância); arena única de vértices com `baseVertex` (R4); compartilhar a instância JS (proibido, `ReuseError`).

### R2 — Grupos de instâncias mantidos pela C2 (`slot.entities({ groupBy })`)

**Decisão**: `slot.entities` ganha `groups?: { key: (entry) => GroupKey; instance: 'record' | readonly [ResourceType,
descId] }`. A C2 mantém, por conjunto, os grupos e um buffer de storage `u32` com a lista de instâncias (o slot do
registro, ou o slot de pool do descritor nomeado). Cada grupo ocupa um segmento contíguo com capacidade em potência de
2; remoção por troca com o último (1 escrita); grupo que excede a capacidade muda para um segmento novo no fim (escrita
do grupo inteiro, amortizada); segmentos livres reaproveitados por classe de tamanho; o buffer cresce por dobra com
`poolReallocated`/`bindGroupReplaced`. A chave é reavaliada em inserção, remoção, troca de Resource e quando um Resource
do conjunto é enviado (só para as entradas enviadas no quadro — O(mudanças)). O `BoundEntities` entrega
`groups: readonly DrawGroup[]` (`key`, `first`, `count`, a entrada representante) e o buffer de instâncias.

A chave é dado do estágio (C4 sabe que pipeline cada material usa e que a face inverte com escala espelhada); a C2 só
agrupa — continua sem conhecer geometria nem render (ARQ L1327).

O forward agrupa por `(geometry.contentKey, schema do material, frontFace)`; a sombra por `(contentKey, frontFace)` com
`instance: [Transform, 'world']`. O shader faz `renderables[instances[instance_index]]` (forward) e
`worlds[instances[instance_index]]` (sombra). Draw: `drawIndexed(indexCount, count, 0, 0, first)`.

**Variante de face**: decidida na CPU pelo sinal do produto de `Transform.scale` (intenção que a CPU tem; a física só
escreve posição e rotação). Uma entidade cuja escala troca de sinal muda de grupo no quadro do envio.

**Alternativas rejeitadas**: um buffer por grupo (bind group por grupo; o 006 mostrou o custo de rebind no Metal);
reordenar o pool `Renderable` por grupo (move slots de outros consumidores); lista de instâncias montada em compute com
ordenação por chave a cada quadro (é o caminho da F7 com culling — aqui a composição muda por evento e a CPU já sabe);
draw indireto (F7).

### R3 — Ordem dentro do grupo e imagem

**Decisão**: a ordem de inserção dentro do grupo é a de inserção das entidades (igual à ordem de draw de hoje); a troca
com o último na remoção muda a ordem só depois de remoções. Objetos opacos com teste de profundidade `less` dão a mesma
imagem em qualquer ordem, exceto em empates exatos de profundidade, que as cenas de referência não têm.

### R4 — Sem arena de geometria e sem vertex pulling nesta spec

**Decisão**: o vértice continua lido por atributos do vertex buffer da cópia única (R1), religado uma vez por grupo. O
"vertex pulling" e a arena única (um buffer com `baseVertex`/`firstIndex`) não entram:

- o layout intercalado atual (posição `vec3`, normal `vec3`, uv `vec2`, 32 B) não é legível como `array<Struct>` em
  storage sem offsets à mão (o `vec3f` em storage alinha a 16 → struct de 48 B), o que a regra da 005 proíbe; mudar o
  layout para 48 B aumenta 50% a memória e a banda de vértice;
- nas GPUs Apple a busca de vértice já é feita no shader; o ganho do pulling seria trocar `setVertexBuffer` por bind
  group por grupo — equivalente com poucos grupos;
- a arena só paga com draw indireto múltiplo (um bind para todos os grupos), que é da F7; a geometria produzida em
  compute (008) escreve nos buffers de vértice por `ComputeKernelBinding` (aceito desde a 006).

O ROADMAP (linha F2) é atualizado: vertex pulling e arena passam para a F7 junto do indireto, com este motivo.

### R5 — Envio por delta: espelho por pool, slot O(1), faixas contíguas

**Decisão**: cada pool com política `'always'` mantém um espelho em CPU (`ArrayBuffer` de `capacidade × stride`) e um
mapa `Resource → slot` (além de `entity → slot`). `markDirty` registra o slot sujo do pool (bitset). Em
`frameRecording`, por pool: empacota cada Resource sujo no espelho (`schema.pack` direto na vista do slot), percorre
os slots sujos em ordem, junta faixas contíguas e faz um `core.write` por faixa a partir do espelho. Slots de posse da
GPU (R7) quebram a faixa e nunca são escritos.

**Notificação**: o `resourceReady` por Resource deixa de existir para dados de pool; a C2 emite
`poolWritten { poolKey, ranges }` uma vez por pool por quadro, e o `FlowBinder` só entrega a runtimes cujos slots ou
`listens` cobrem o pool (índice pool → runtimes, sem `getDescriptors()` por evento). Resources individuais continuam
com `resourceReady`.

**Crescimento**: o buffer novo recebe os dados antigos por `copyBufferToBuffer` na GPU (`Frame.copy` no `frameRecording`,
como já fazem os pools `'initial'`); o espelho cresce por cópia de `ArrayBuffer`. Nenhum reempacotamento.

**Alternativas rejeitadas**: um `write` por Resource com o slot em mapa (resolve o O(N²), não o número de escritas);
staging com `mapAsync` (latência e um quadro de atraso); empacotar tudo a cada quadro (custo proporcional ao pool).

### R6 — Agregação de eventos de inserção em massa

**Decisão**: `entitiesInserted`/`entitiesRemoved` já são emitidos por inserção; os runtimes acumulam as mudanças e as
aplicam uma vez por quadro (em `framePrepare`), em vez de reconstruir listas por inserção. `entitiesChanged` ao Flow é
um por conjunto por quadro com `added`/`removed`. O custo da inserção de 1 milhão de entidades é linear.

### R7 — Posse por conjunto: a física escreve o `Transform` na GPU

**Decisão**: `slot.entities` ganha `owns?: readonly (readonly [ResourceType, descId])[]`. Para cada entidade do
conjunto, a C2 marca o slot daquele descritor como de posse da GPU: depois do primeiro envio (pose inicial), a CPU não
o envia mais; mutação em `data` gera um aviso único por Resource (regra do `upload: 'initial'`, ARQ L1981-1995) e o
crescimento do pool preserva o dado por cópia na GPU (R5). Ao sair do conjunto (corpo removido ou trocado), a posse
volta à CPU e o dado de intenção é reenviado.

O `LCPFlow` declara `poses: slot.entities({ all: [RigidBody, Transform], record: PoseRecord, owns: [[Transform,
'transform']] })` com `PoseRecord { bodySlot: u32, transformSlot: u32 }`, e um kernel `rb_publish_pose` (um thread por
registro) copia posição e rotação de `bodies[r.bodySlot]` para `transforms[r.transformSlot]` no fim do passo, antes da
fase `transform` (ordem de fases fixa). O `TransformFlow` compõe a matriz no mesmo quadro: a pose desenhada é a do
passo do quadro (some o quadro de atraso). O readback por quadro, o staging e o mapa slot→entidade saem.

Corpos estáticos (`mass 0`) entram no mesmo conjunto: a pose publicada é a inicial (o solver não os move), e a posse
da GPU vale para todo `Transform` de corpo — mover um corpo pela CPU (cinemático, teletransporte) é da F5 (018).

**Trajetória**: o estado do solver vive no pool de corpos; a mudança é só de onde a pose é publicada. As fixtures de
trajetória continuam bit a bit (R8 lê a mesma pose).

### R8 — Leitura sob demanda (C2)

**Decisão**: `ResourceSystem.read(resource, descId?)` → `Promise<Record<string, unknown>>` lê o slot do Resource no
pool (ou o buffer individual) por cópia para staging e `mapAsync`, e desempacota pelo schema. Pedidos do mesmo quadro
são agrupados numa cópia por pool (faixas). `readAll(poolKey, entities)` lê um conjunto. Resource removido antes da
resposta resolve com `undefined`. Smokes e testes que liam `transform.data` de corpos passam a usar a leitura. Exposto
na fachada como `world.read(resource)` (C2, sem C1).

**Diagnóstico de excedente de contatos**: o contador de excedente é lido por `read` a cada 60 passos no máximo, sem
bloquear (pula se a leitura anterior não voltou). É o único readback periódico da física, de 4 bytes, e não é de pose.
A spec é ajustada (FR-013/SC-005: "0 leituras de pose por quadro; diagnóstico amostrado").

### R9 — Broadphase: grade hash sobre proxies de collider, pares candidatos e despacho indireto

**Decisão**:

1. **Proxies**: kernel `rb_collider_proxies` reúne de todos os pools de forma um proxy `{ center, radius, kind, slot }`
   (esfera envolvente na pose predita, expandida pela margem preditiva `|v|·dt + ½|g|·dt² + contactOffset` do passo).
   Planos e colliders com raio maior que a célula vão para a lista "sempre" (testada contra todos os corpos, como hoje).
2. **Grade**: hash espacial ilimitado (coordenada da célula → tabela de 2^k ≥ 2·proxies), com contagem, `PrefixSum` e
   scatter — generalização da `NeighborSearchPipeline` da 005 (que hoje usa grade limitada) para chave por hash; a
   versão limitada continua para SPH/PBF. Célula = 2 × o maior raio entre os proxies pequenos (calculado na CPU pela
   intenção dos colliders, atualizado por evento).
3. **Pares**: um thread por corpo varre as 27 células e escreve pares candidatos `(corpo, kind, slot)` com sobreposição
   das esferas envolventes, em listas por forma com contadores; os contadores geram os argumentos de despacho indireto
   (`rb_pairs_indirect`).
4. **Narrowphase**: cada variante passa a ler `(rb_i, col_j)` do par candidato em vez de `idx / pool_count` e é
   despachada por `workgroupsIndirect`. A broadphase roda uma vez por passo (margem cobre os substeps); a narrowphase,
   por substep sobre os mesmos candidatos.
5. **Capacidade**: `N × maxPairsPerBody` (padrão 64, opção do Flow); excedente contado e lido pelo diagnóstico de R8.

**Mesmo conjunto de contatos (FR-015)**: a narrowphase só gera contato quando a distância de SDF é menor que a margem
preditiva do substep; a esfera envolvente expandida pela margem do passo contém todos esses pares, então o conjunto é o
mesmo da varredura exaustiva. Como o solve é independente da ordem (A7), as trajetórias continuam bit a bit. Teste: em
cenas de 1k e 10k corpos, o conjunto de contatos (ordenado por par e feature) é igual ao da exaustiva, por substep.

**Alternativas rejeitadas**: sweep-and-prune por ordenação a cada passo (radix sort de 2N chaves por eixo, mais pares
falsos em pilhas); BVH (reconstrução por passo; F7 a usa para culling); grade limitada (corpos fora da grade caem na
borda e degradam).

### R10 — Câmera = `Camera` + `Transform`, kernel de câmera e `Input` como Resource

**Decisão**:

- `Camera` passa a ter só parâmetros (`projection: 'perspective' | 'orthographic'`, `fov`, `orthoHeight`, `near`,
  `far`, `aspect`, `aspectMode: 'canvas' | 'fixed'`) num pool de storage (`camera`, `'always'`) e as matrizes num
  segundo descritor do mesmo Resource (`matrices`, pool `'never'`, `{ view, projection, viewProjection, position }`) —
  mesmo slot, como `Transform`/`WorldTransform`.
- `CameraFlow` (C3, fase `transform`, prioridade menor que a do `TransformFlow`) com `slot.entities({ all: [Camera,
Transform], record: CameraRecord { cameraSlot, transformSlot } })`: um thread por câmera calcula `view` como a
  inversa rígida da matriz de mundo (colunas normalizadas), `projection` pela matemática de referência (a mesma dos
  controllers de hoje, uma vez, em `wgslLib.camera`), `viewProjection` e `position`.
- O forward lê `cameras[frame.cameraSlot]`; `frame.cameraSlot` (em `ForwardFrameParams`) é escrito quando a câmera ativa
  muda. O `SingletonResolver` da câmera passa a resolver o slot da câmera ativa.
- `aspectMode: 'canvas'`: a C4 (`Application`) reage a `canvasReconfigured` escrevendo `aspect` na intenção dessas
  câmeras (envio por delta).
- `Input` vira Resource singleton da C2 com `StructSchema('Input', {})` (marcador, sem descritores), a API de consulta
  atual e o push pelo EventBus; inserido por `Application.create`; `SingletonResolver('Input')` registrado.
- Controllers (`Orbit`, `Fly`, `Fps`): Resources sem dado de GPU, componentes da entidade da câmera, com
  `tick(input, dt, transform)`; o `InteractionSystem` percorre os controllers do World em `frameTick` e só muta
  `transform.data.position/rotation` (o orbit guarda alvo e ângulos no próprio `data`). A matemática de matriz sai dos
  controllers; resta só a de orientação (quaternion a partir de ângulos), que é intenção.
- O adaptador do bench e os smokes criam a câmera com `Transform` (posição e rotação de "olhar para" calculada como
  quaternion — intenção, não matriz).

**Imagem (FR-025)**: as matrizes passam de `f64` (CPU) para `f32` (GPU). Hipótese: diferenças de último bit nas
matrizes podem trocar pixels de borda. Procedimento: medir contra as fixtures antes de qualquer outra mudança de render
(T de verificação); se houver diferença, registrar a contagem de pixels e o maior desvio, e regravar as fixtures só com
a diferença limitada a ≤ 0,1% dos pixels e desvio ≤ 2/255, aprovada no PR. Mesma regra para a matriz da sombra (R11).

**Alternativas rejeitadas**: manter a câmera individual uniform (o ROADMAP a coloca em pool; F4 traz multi-câmera);
calcular as matrizes na CPU uma vez (contraria D2 e o ponto `camera`).

### R11 — Luz e sombra lidas do estado de cena

**Decisão**: o forward lê `lights[frame.lightSlot]` (direção, cor, intensidade) do pool `Light`; `frame.lightSlot` é o
da luz direcional dona do `ShadowMap` que projeta, como hoje (sem ela, o `DEFAULT_LIGHT_DIR` atual por sentinela no
slot). `ShadowMap` separa parâmetros (`bias`, `normalBias`, `size` — `'always'`) e matriz (`shadowMatrix`, `'never'`,
mesmo slot). `ShadowMatrixFlow` (C3, fase `transform`, depois da câmera) calcula a mesma ortográfica ±10 de hoje a
partir da direção da luz, com `slot.entities({ all: [DirectionalLight, ShadowMap], record: ShadowRecord })`. Nenhum
uniform de luz escrito por quadro pela CPU.

### R12 — `Parent` e composição por níveis

**Decisão**: `Parent` (C3) é um Resource sem dado de GPU (`{ entity: EntityId }`), componente opcional. O
`TransformFlow` mantém, por eventos (`entitiesChanged` do conjunto `[Transform]` e do conjunto `[Transform, Parent]`),
um buffer privado `hierarchy: array<u32>` (slot do pai ou `0xFFFFFFFF`) e listas de slots por nível (nível 0 = raízes).
Sem nenhum `Parent`, despacha como hoje (um passe sobre o pool). Com `Parent`, despacha o nível 0 sobre todos e cada
nível ≥ 1 sobre a sua lista (`world = world[pai] · TRS`). Ciclo, pai sem `Transform` e `Parent` em entidade cujo
`Transform` é de posse da GPU (R7) são rejeitados na inserção com erro; pai removido torna os filhos raízes com aviso.

### R13 — Escala de 1 milhão

**Decisão**: R1 (sem arrays por instância, 1 cópia), R2 (1 draw), R5 (sem reempacotar), R6 (eventos agregados).
Verificação: smoke `scale1m` mede o heap JS e a memória de GPU após montar 1 milhão de caixas; meta de heap ≤ 1,5 GB e
memória de GPU = pools + 1 geometria. Se o heap passar, reduzir estruturas por entidade nos runtimes (as listas de
`EntityEntry` por Flow são a próxima candidata: entradas passam a ser índices em arrays tipados).

### R14 — Residual de GPU do SC-010 da 006

**Decisão**: medir a GPU de `instances/10k` depois de R2 (1 draw em vez de 10 001). Se ≤ 0,52 ms, registrar. Se não,
experimentos em ordem, cada um isolado: (a) mesmo shader com `instance_index` sem a indireção da lista; (b) sombra
desligada; (c) leitura do material reduzida a um campo; (d) comparação com o `b437e47` por timestamps por passe (sombra
× forward) para atribuir o residual a um passe. Registro em `tasks.md` com números.

### R15 — Benchmark

**Decisão**: o adaptador do clayflow cria a câmera por `Camera` + `Transform` (sem matrizes); as limitações
declaradas resolvidas saem (`sem instancing`, `readback`, `um envio por objeto`, `narrowphase O(N·M)`); a contagem de
draws reportada passa a ser a dos grupos. O baseline vigente é o do Chrome 155 (`b17d5d6`).
O `bench:check` compara como sempre; se apontar a GPU de `instances/10k-moving`, o registro mostra as repetições do
baseline e a bimodalidade já documentada (PENDENCIAS §0) — nada é filtrado no harness. O baseline é regravado ao fim.
