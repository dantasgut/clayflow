# Research: Geometria em compute — partículas, fluidos e corpos moles na tela

**Spec**: [spec.md](./spec.md) · **Plano**: [plan.md](./plan.md)

## Achados (código em `develop`, `10c9be4`)

| #   | Achado                                                                                                                                                                                                                                                                                     | Evidência                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| A1  | Um Resource ocupa **um** slot em cada pool (`Tracked.slot`, o mesmo em todos os pools do Resource). `chooseSlot` usa a free-list de slots soltos ou o fim; `count` é a marca d'água (maior slot + 1, nunca desce). `desc.count` é ignorado em pool                                         | `ResourceSystem.ts:38-74`, `:86`, `:1307-1372`                                                         |
| A2  | `upload:'initial'` empacota um registro (`schema.pack(resource.data)`) e guarda por slot; o envio por delta junta faixas contíguas; `release` libera um slot (sem zerar a GPU)                                                                                                             | `ResourceSystem.ts:1332-1336`, `:886-963`, `:1546-1561`                                                |
| A3  | Os cinco solvers de partícula despacham `bodies.count` (marca d'água) e os kernels só testam `i >= count`: assumem `[0, count)` sem buracos. Um slot liberado continua simulado com bytes velhos e, no SPH/PBF, entra na busca de vizinhos — já é um defeito hoje                          | `SPHFlow.ts:170,183`; `PBFFlow.ts:207,225`; `MPMFlow.ts:192`; `XPBDFlow.ts:149`; `sph_density.wgsl:15` |
| A4  | `FluidBody`/`SoftBody` são uma partícula por entidade; schema escolhido pelo `algorithm` (SPH/PBF/MPM; XPBD/FEM/MPM) ou cru `{schema, data}`; descritor `body` em pool, `storage-rw`, `upload:'initial'`. Massa/volume dos fluidos vêm do `ParticleMaterial` singleton                     | `FluidBody.ts:12-95`; `SoftBody.ts:12-97`; `SPHFlow.ts:62`                                             |
| A5  | `DistanceConstraint` guarda `i`/`j` como **slots absolutos** do pool de partículas, enviados crus; o XPBD resolve em Gauss-Seidel serial (`@workgroup_size(1)`, laço na ordem do pool). `SpringConstraint`/`JointConstraint` não têm consumidor; FEM só integra gravidade (elástico na F5) | `DistanceConstraint.ts:7-41`; `distance_solve.wgsl:6-30`; `XPBDFlow.ts:168`; `shaders/fem.ts:7`        |
| A6  | Trajetórias: sete cenas, bit a bit (tolerância 0), uma entidade por partícula inserida em ordem num World vazio — a partícula i cai no slot i. A leitura copia o pool inteiro por `schema.name`. XPBD: corrente de 32 com 31 restrições `{i, i+1}`; FEM 64; MPM 512/1000; SPH/PBF 1000     | `trajectories.ts:126-151`, `:182-354`, `:415-432`                                                      |
| A7  | Nenhum estágio de render lê pools de corpo; os pools têm usage só `STORAGE` (sem `VERTEX`). `vertex` = `VERTEX\|STORAGE\|COPY`, `index` = `INDEX\|STORAGE\|COPY`                                                                                                                           | `GpuEngineCore.ts:33-49`                                                                               |
| A8  | Forward: grupos por `contentKey\|pipeline do material\|face`; pipeline força `triangle-list`, `cullMode:'back'` e layout de 32 B; grupo sem índices é pulado; desenho `draw.indexed(…, group.first)`; instância → `renderables[instances[instance_index].renderable]`                      | `ForwardFlow.ts:47-57`, `:93-97`, `:318-353`, `:387-428`; `forward.wgsl:4-40`                          |
| A9  | Sombra: grupos por `geometria\|face` sem material, `triangle-list` fixo, layout só posição (stride 32), pula grupos sem índices                                                                                                                                                            | `ShadowFlow.ts:51-54`, `:80-99`, `:205`                                                                |
| A10 | Materiais: `Standard` (`triangle-list`), `Wireframe` (`line-list`), `PointSprite` (`point-list`), todos com o shader `forward` e o pool lido como `StandardMaterial` (o `radius` do sprite cai em `roughness`); nenhum declara regra de sombra                                             | `StandardMaterial.ts:46-63`; `WireframeMaterial.ts:50-67`; `PointSpriteMaterial.ts:53-70`              |
| A11 | Pipeline de render sem vertex buffers é suportado (C1 omite `buffers`); `Drawer` tem `vertices`, `indexed`, `indirect`, `indexedIndirect`                                                                                                                                                  | `PipelineState.ts:282-297`; `GpuEngineCore.ts:764-777`; `Drawer.ts:3-14`                               |
| A12 | Visibilidade de binding inferida por alcance a partir do entry point: storage lido no `vs_main` recebe `VERTEX` e vira `read-only-storage`. Fontes privadas aceitam qualquer buffer não-uniform (inclusive vertex/index)                                                                   | `LayoutInferencer.ts:163-167,287`; `sources.ts:67-80`                                                  |
| A13 | `bodyType` tem um vencedor por tipo sem considerar fase: um Flow de render com `bodyType` desalojaria o solver                                                                                                                                                                             | `FlowRegistry.ts:145-176`                                                                              |
| A14 | Descritor `vertex`/`index` com `upload:'never'`: tamanho `stride*count`; índice vira `uint16` sem conteúdo (inviável para kernel WGSL e > 65 535 vértices); sem dedup; sem envio. `owns` só cobre descritores em pool                                                                      | `ResourceSystem.ts:1121-1159`; `slots.ts:104-110`                                                      |
| A15 | `PointCloudGeometry` declara `points` como `storage-rw` (não `vertex`), sem escritor; nunca desenhada                                                                                                                                                                                      | `PointCloudGeometry.ts:32-41`; `ForwardFlow.ts:333-335`                                                |
| A16 | A caixa com `WireframeMaterial` está na `baseScene` do smoke `render`, reutilizada pelas 10 cenas (forward, 8 pós, UI): respeitar a topologia muda as 10 fixtures. Testes que assumem o atual: `RenderGroups.test.ts:29-58`, `ForwardFlow.perEntity.test.ts:87-113`                        | `render.ts:87-90`                                                                                      |
| A17 | `resources.read(resource, descId?)` devolve um registro (um slot); o agrupamento de leituras por faixas já existe                                                                                                                                                                          | `ResourceSystem.ts:552-663`                                                                            |
| A18 | Os `*_vertex_write` foram removidos na 005; o documento de arquitetura descreve o alvo: vertex shader lê o pool pelo índice da instância, sem cópia                                                                                                                                        | `architecture_resource_loaders.md:2387-2392`                                                           |

## Decisões

### R1 — Faixa de pool: um Resource ocupa N slots contíguos

**Decisão**: descritor em pool ganha `count?: number` (padrão 1). `Tracked.slot` vira `first` + `span`. O alocador
troca a free-list de slots por uma lista de **intervalos livres** ordenada, com coalescência na liberação, first-fit e,
sem faixa livre, o fim do pool (crescendo por dobra em laço até `first + span ≤ capacity`). `slotByEntity` guarda
`first`; `entityBySlot`, `occupants`, bits de sujo/escrito/posse e `initial` são aplicados sobre a faixa. Os
descritores do mesmo Resource em pools diferentes continuam com o mesmo `first` quando o `count` é igual; com `count`
diferente (ex.: partículas e arestas do mesmo corpo), cada pool tem a sua faixa (`Tracked` guarda a faixa por pool).

**Empacotamento**: para `count > 1`, `data[desc.id]` é um registro de arrays por campo (SoA na CPU: `pos` com
`4·N` floats etc.). `StructSchema.packRange(soa, start, n)` produz os bytes AoS do layout do pool. A C2 empacota a faixa
inteira no `initial` e, para `'always'`, só as faixas sujas (índice local = slot − `first`).

**Leitura**: `resources.read` de um Resource com `span > 1` devolve o registro SoA da faixa (mesmo formato da escrita).

**Alternativas rejeitadas**: (a) manter uma entidade por partícula e agrupar por "corpo" num Resource extra — mantém a
sobrecarga por partícula e não dá identidade ao corpo; (b) buffer próprio por corpo fora do pool — os solvers teriam
de iterar buffers distintos (um dispatch por corpo, binds por corpo), contra o modelo de pool.

### R2 — Slots vivos visíveis à GPU

**Decisão**: a C2 mantém por pool um **bitset de ocupação na GPU** (`pool:<schema>:live`, `array<u32>`, 1 bit por slot),
escrito por delta junto com o pool (mesma faixa, mesmo `frameRecording`) e exposto em `BoundPool.live`. O módulo WGSL
`poolLive` (`pool_live(i) -> bool`) entra na `wgslLib`. Os kernels de partícula testam `pool_live(i)` além de
`i >= count`; a construção da grade de vizinhança ignora slots mortos.

Resolve o defeito A3 (slot liberado simulado e contaminando vizinhos) e permite reuso de faixas sem compactar (que
moveria corpos vivos e quebraria referências). Corpos vivos não mudam de slot; trajetória preservada.

**Alternativas rejeitadas**: compactação (move slots, invalida restrições e bind de render); zerar `inv_mass` dos
slots livres (semântica de domínio na C2; não serve a SPH/PBF/MPM, que não têm massa por partícula).

### R3 — Referências de slot no schema (restrições entre partículas)

**Decisão**: campo de schema com tipo `FieldType.slotRef(target)` (WGSL `u32`). No dado, o valor é
`{ body: Entity, index: number }` (ou só `index`, referindo-se ao próprio Resource para `target: 'self:<descId>'`). A
C2 resolve no empacotamento para `first(body, pool) + index` e reempacota os registros que referenciam um corpo quando
a faixa dele é alocada (inserção depois da restrição). Referência a corpo ausente é erro na inserção nomeando a
restrição e o corpo; referência fora da faixa (`index ≥ span`) também.

- `DistanceConstraint` passa a `{ a: { body, index }, b: { body, index }, restLength, compliance }` (incompatível;
  guia de migração).
- `SoftBody` aceita `edges` (pares de índices locais + comprimento de repouso opcional) e os declara como um segundo
  descritor em pool no pool de restrições (`DistanceConstraint.schema`), com `slotRef('self:body')` — uma corrente
  XPBD é **um** corpo.
- O WGSL do XPBD não muda (continua lendo `c.i`/`c.j` absolutos).

**Alternativas rejeitadas**: o XPBD somar `first` no kernel (exige o corpo de cada restrição na GPU e só serve ao
XPBD); índices absolutos escritos pelo usuário (impossível com faixas alocadas pela C2).

### R4 — Sprites de corpos lidos direto do pool (`ParticleFlow`, C4)

**Decisão**: novo estágio `ParticleFlow` (fase `forward`, prioridade abaixo do `ForwardFlow`, mesmo alvo com
`loadOp:'load'` de cor e profundidade). Slot `slot.entities({ all: [ParticleBody, Material] })`, onde `ParticleBody` é a
base nova de `FluidBody`/`SoftBody` (C3) que expõe o pool e a faixa. Um pipeline (`particle_sprite`, sem vertex
buffers): o vertex shader gera o quad por `vertex_index` (6 vértices) e lê a posição em
`pool[(first + instance_index) * stride_vec4 + pos_offset_vec4]`, com `array<vec4f>` ligado como storage de leitura no
vértice. Um uniform por corpo (`ParticleDrawParams { first, stride_vec4, pos_offset_vec4, material_slot }`, numa lista
com offset dinâmico, escrito quando a faixa muda). Desenho: `draw.vertices(6, span, 0, 0)` por corpo; bind group do pool
por schema (um por pool, trocado por `bindGroupReplaced` no crescimento).

`pos_offset` e `stride` vêm do `StructSchema` do pool (campo `pos`, exigido: erro na inserção se o schema do corpo não
tiver `pos: vec4f`). Posição não finita → o vertex shader manda o quad para fora do clip (sem desenho).

Profundidade: sprite em espaço de vista com profundidade do centro (sem escrita de profundidade por fragmento);
fragment descarta fora do círculo (sprite redondo) e sombreia com a normal da esfera impostora e a luz do pool.
Sombra: corpos de partícula não projetam (R7).

**Alternativas rejeitadas**: registrar por `bodyType` (A13 — desaloja o solver); copiar posições para um vertex buffer
(cópia por quadro, contra A18); um pipeline por schema (o uniform com stride/offset serve a todos).

### R5 — Superfície de corpo mole como geometria escrita pela GPU

**Decisão**: `SoftBody` com `surface: { triangles, uvs? }` cria como parte uma `SurfaceGeometry` (C3, `Geometry` com
`vertices` `role:'vertex'` `upload:'never'` no layout de 32 B do forward e `indices` `upload:'initial'` `uint32` com os
triângulos locais) e uma tabela de adjacência vértice → triângulos (CSR, `upload:'initial'`). O estágio
`SoftSurfaceFlow` (C3, fase `transform`, prioridade depois dos solvers) despacha dois kernels por corpo:
`soft_face_normals` (normal por triângulo, lendo posições do pool pela faixa) e `soft_vertex_write` (posição + normal
média dos triângulos adjacentes + uv no vertex buffer). Determinístico (sem atomics de float).

A geometria entra no forward como qualquer outra (material e `Transform` identidade do corpo); a sombra a desenha.
O estágio declara a posse do descritor `vertices` (R6).

**Alternativas rejeitadas**: normais por atomics (`atomic<f32>` não existe; ponto fixo traz erro); desenhar a malha no
`ParticleFlow` (duplicaria forward e sombra).

### R6 — Geometria escrita pela GPU: posse de descritor individual e formato de índice

**Decisão**:

- `GPUDescriptor` de papel `index` ganha `indexFormat?: 'uint16' | 'uint32'` (obrigatório com `upload:'never'`).
- `slot.entities({ owns })` passa a aceitar descritores individuais: a C2 marca o Resource como `GpuManaged`
  naquele descritor, registra o escritor e avisa **uma vez** quando uma geometria com descritor `'never'` entra num
  grupo de draw sem escritor (FR-014).
- A ordem escrita → desenho vem das fases (`transform` antes de `shadow`/`forward`); o grafo de dependências já
  ordena por fase e prioridade.
- `PointCloudGeometry`: `points` vira `vertices` `role:'vertex'` `upload:'never'` (layout 32 B: posição, normal, uv),
  `count: maxPoints`; contagem ativa em `data.activeCount` (CPU) ou, quando o escritor declarar, num buffer indireto
  (`drawCount`), consumido por `draw.indirect`. Geometria sem índices → `draw.vertices` (FR-015).

### R7 — Topologia do material no forward e na sombra

**Decisão**:

- `Material` (C3) expõe `topology` (do descritor de pipeline) e `castsShadow` (padrão: `true` para triângulos,
  `false` para linhas e pontos; opção no construtor).
- `forwardGroupKey` inclui a topologia. O pipeline usa a topologia do material; `cullMode` só para triângulos.
- **Linhas** (`WireframeMaterial`): índice de arestas derivado por kernel (`edges_from_triangles`: 6 índices por
  triângulo, arestas compartilhadas desenhadas duas vezes — pixels idênticos) num buffer `index` privado do forward por
  geometria (chave de conteúdo), gerado na entrada do grupo e refeito no `resourceReady` da geometria.
- **Pontos** (`PointSpriteMaterial`): pipeline de sprite do forward (sem vertex buffers; quad por `vertex_index`, posição
  lida do vertex buffer da geometria como storage — usage `STORAGE` já existe), `draw.vertices(6 · vertexCount,
group.count)`; o shader separa vértice e instância (`vertex_index / 6`). `PointSpriteMaterial` ganha o próprio struct
  WGSL (`color`, `radius`) em vez do alias de `StandardMaterial`.
- `ShadowFlow` passa a incluir `Material` no conjunto e grupos só de materiais com `castsShadow`.

### R8 — Fixtures de imagem e testes afetados

**Decisão**: as 10 fixtures `render-*` mudam pela caixa de arame (A16); são regravadas num commit próprio, com a
diferença descrita (só os pixels da caixa: faces viram arestas) e aprovação pedida no PR. Os testes
`RenderGroups`/`ForwardFlow.perEntity` passam a afirmar os grupos com topologia (sombra `[10, 10]`). Novos smokes de
imagem: `particles` (SPH, PBF, MPM fluido e sólido), `softSurface` (XPBD com malha, FEM como sprites) e `pointCloud`
(espiral escrita por kernel), com referência gravada e verificação de movimento (duas capturas diferentes).

### R9 — Trajetórias com contêineres

**Decisão**: o smoke `trajectories` monta cada cena com **um** corpo cujos arrays reproduzem a ordem e os valores de
hoje (o laço `block()`/`FLUID_BLOCK` e o jitter `mulberry32` produzem arrays em vez de entidades). Num World vazio a
faixa começa no slot 0 e os bytes são os mesmos; a corrente XPBD vira um corpo com 31 `edges` na mesma ordem (pool de
restrições 0..30). A fixture não muda. A massa por partícula (`mass[i]`) é aceita pelo contêiner (XPBD fixa a 0 do
primeiro nó).

### R10 — Teto de partículas validado na inserção

**Decisão**: o teto da busca de vizinhança (65 536, E4) vira constante exportada do estágio; a inserção de um corpo que
leva o pool além do teto lança erro nomeando o corpo, o pedido e o teto. Aumentar o teto continua na F5.

### R11 — Benchmark de partículas

**Decisão**: cena `particles` com variantes `4k` e `65k` (SPH num tanque, câmera fixa). clayflow: um `FluidBody`
com `PointSpriteMaterial`. Three: `InstancedMesh` de quads (ou `Points`) com o mesmo número de partículas e posições
atualizadas pela CPU por uma integração simples, como referência de custo de desenho (a simulação não é comparável).
Limitação declarada no resumo do bench.

### R12 — Montagem por partícula removida

**Decisão**: `FluidBody`/`SoftBody` passam a exigir arrays (`count` derivado de `position`); a montagem de uma partícula
é o caso N = 1 com arrays de um elemento. Sem camada de compatibilidade; guia de migração com o equivalente. O modo cru
`{ schema, data }` continua, agora com `data` SoA e `count`.
