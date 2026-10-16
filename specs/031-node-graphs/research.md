# Research — 031 Composição por grafos de nós e contratos de shader estruturados

Levantamento na `develop` após o PR #45 (2026-10-16), feito por quatro auditorias de leitura do código (ligações e
layouts; pontos de extensão da 009; Flows, kernels e indireto; render, água e fixtures), além da auditoria de
acoplamento citada na spec.

## Achados

| #   | Achado                                                                                                                                                                                                                                                                         | Evidência                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| A1  | O módulo WGSL não declara recursos: `WgslModule` tem `name`, `source`, `requires`, `structs`, `symbols`; as ligações existem só como texto. O varredor detecta `var` de módulo, mas descarta grupo, ligação e tipo                                                             | `scene/shaders/WgslModule.ts:10-21`, `scanWgslSymbols.ts:81-90`                                                 |
| A2  | O layout é inferido por regex (`@group` seguido de `@binding`), com visibilidade por alcance de chamadas; grupos de 0 ao maior sempre emitidos; não há cache — `infer` roda a cada `PipelineState`                                                                             | `scene/systems/LayoutInferencer.ts:102-103`, `:150-187`, `:180-184`                                             |
| A3  | Resolução de cada ligação: global de ponto de cena **por nome** → privado `pipeline:var` → privado `var` → `consumes` pelo **nome do struct** (exatamente um); `createComputeKernel` liga só por nome                                                                          | `systems/flowBinding/FlowRuntime.ts:628-678`, `flows/createComputeKernel.ts:90-117`                             |
| A4  | 141 arquivos WGSL, 472 declarações `@group` em 90 arquivos (268 no grupo 0, 136 no 1, 43 no 2, 25 no 3); 72 chamadas `setBindGroup` com índice literal fora de testes                                                                                                          | auditoria 1                                                                                                     |
| A5  | Nenhum conceito de frequência de grupo; nenhum layout conferido contra `maxBindGroups`/`maxStorageBuffersPerShaderStage` (pedidos no máximo do adaptador, nunca verificados)                                                                                                   | `core/gpu/GpuContext.ts:17-24`; `PipelineState.ts:233-280`                                                      |
| A6  | Constantes `override`: a C1 aceita (`constants` nos specs de pipeline), mas `PipelineDescriptor` e `createComputeKernel` não expõem; nenhum WGSL usa `override`                                                                                                                | `core/contracts/specs/ComputePipelineSpec.ts:20-21`, `RenderPipelineSpec.ts:37-54`                              |
| A7  | `composeWgsl` memoriza por módulo de entrada, ordena por `requires`, deduplica structs por `wgslName` e já trata `var` como símbolo (duas declarações conflitam); confere só chamadas (`ident(`), não variáveis                                                                | `composeWgsl.ts:26-82`, `:174-192`                                                                              |
| A8  | Pontos da 009: registro genérico `v0..v7: vec4u` + `revision`/`kind`, teto 32 escalares; carregador gerado com `bitcast`; renomeação por regex `\bnome\b` nos pontos de cena; um pool por ponto (o de `field` compartilhado com os campos prontos por `kind`)                  | `ExtensionRecord.ts:5-29`, `ExtensionFunction.ts:258-330`                                                       |
| A9  | Troca pronto → usuário por `bindPoints` (reescreve a árvore de `requires`, memorizado); cada estágio mantém o próprio `active/pending` (Transform, Camera, Surface, Emit, Forward); `ExtensionPipelines` existe mas não é usado por todos                                      | `bindPoints.ts:21-70`, `flows/ExtensionPipelines.ts:23-105`, `SurfaceFlow.ts:362-440`, `EmitterFlow.ts:284-313` |
| A10 | Vínculo entidade → função: `Renderable.fnSlot` (opcional, `RECORD_NONE`), `transform_fn_pairs: array<vec2u>`, `camera_fn_list: array<vec4u>` posicional, `record_slot` em uniform (surface, emit), slot embutido no código gerado (field, space)                               | `Renderable.ts:14-48`, `camera_compose_fn.wgsl:11-38`, `combineFields.ts:13-42`                                 |
| A11 | Forward: slot `water`, `bindCaustics`, 9 substitutos, campo `causticsEnabled`; grupo 3 mistura quadro, sombra, luzes, água; `g3b6` é `caustic_map` no forward e `point_vertices`/`wire_vertices` nos outros → troca de família regrava o grupo 3                               | `ForwardFlow.ts:175`, `:440-514`, `:641-653`, `:760-795`                                                        |
| A12 | Lógica `on`/luz/sombra duplicada no Forward e na Water; a Particle escolhe luz por conta própria; `castingShadowMap` importado por 4 estágios                                                                                                                                  | `ForwardFlow.ts:1056-1070`, `WaterFlow.ts:288-303`, `ParticleFlow.ts:318-328`, `ShadowFlow.ts:34`               |
| A13 | Flows: ciclo `pending → preparing → ready` pela C2; transições por tabela; ordem só por fase + prioridade, sem dependência declarada entre Flows                                                                                                                               | `flows/Flow.ts`, `FlowTransitions.ts:131-193`, `Phase.ts:9`, `FlowRegistry.ts:161-169`                          |
| A14 | Não há buffer intermediário da C2: cada Flow cria e destrói os seus (`core.create`, dobra de capacidade); dado compartilhado entre Flows é um Resource no World com descritores `onDemand` (`WaterSurface`, `FrameTargets`), e "produzido no quadro" é ad hoc (`markProduced`) | `SurfaceFlow.ts:168-357`, `LCPFlow.ts:294-776`, `WaterSurface.ts:54-67`                                         |
| A15 | Primitivas (`PrefixSum`, `RadixSort`, `Compaction`, `Reduce`) aceitam só contagem da CPU; `Compaction` deixa a contagem na GPU, mas nada a converte em argumentos de despacho; o único despacho indireto é o do LCP, escrito ad hoc                                            | `compute/*.ts`, `LCPFlow.ts:534-546`                                                                            |
| A16 | Desenho indireto: a `ParametricSurface` declara `indirect` (`upload: 'never'`), o kernel `emit` escreve os argumentos; o Forward e a Sombra copiam para o próprio buffer indireto por grupo; os passes da superfície não são indiretos                                         | `ParametricSurface.ts:237-270`, `ForwardFlow.ts:606-730`, `ShadowFlow.ts:278-290`                               |
| A17 | Escritor na GPU declarado por `slot.entities({ owns })`; dono duplo é erro; `upload: 'never'` sem escritor gera aviso no Forward                                                                                                                                               | `slots.ts:124`, `ResourceSystem.ts:549-620`, `ForwardFlow.ts:966-975`                                           |
| A18 | Memória de resultado ("nada refeito com a cena parada") é escrita à mão por Flow: `stale/clean` no Transform, `dirty` + `evaluate` na Surface                                                                                                                                  | `TransformFlow.ts:83-305`, `SurfaceFlow.ts:160-534`                                                             |
| A19 | Vértice de 32 B = 8 `f32` (posição, normal, uv); `wire.wgsl` e `point_sprite.wgsl` leem `array<f32>` com deslocamento `o = index * 8u` escrito à mão                                                                                                                           | `ForwardFlow.ts:68-78`, `wire.wgsl:21-24`                                                                       |
| A20 | Fixtures exatas: imagens com `pixels === 0` (render, particles, softSurface, pointCloud, fluidSurface), manifestos por hash (parametricSurfaces, extensionPoints, fluidBehavior, contactSet), trajetórias bit a bit; bench com baseline por perfil (cpu, gpu, p95, p99)        | `__smokes__/support/images.ts:4-15`, `trajectories.ts:434-513`, `bench/core/compare.ts:11-15`                   |

## Decisões

### R1 — Recursos declarados pelo módulo; ligações emitidas pelo motor

**Decisão**: `WgslModule` ganha `resources`: um mapa nome → declaração tipada (`WgslResource`). Um recurso é **ele
mesmo um módulo** criado por `wgslResource({ name, binding, type, frequency, provider })` — sem fonte de função, só a
declaração — e quem o usa o põe em `requires`. A montagem (`composeWgsl`) emite as linhas `@group(g) @binding(b) var…`
no topo do shader, depois dos structs, em ordem determinística. Módulos passam a ser **proibidos** de declarar
`@group/@binding` (erro `manual-binding` na criação, coberto por teste sobre todos os módulos do motor).

- `binding`: `storage` (`read`/`read_write`), `uniform`, `texture` (dimensão, tipo da amostra, multiamostrada,
  profundidade), `storage-texture` (formato, acesso), `sampler`, `sampler-comparison`.
- `type`: `StructSchema` (com `array` opcional) ou tipo WGSL escalar/vetorial para listas simples (`u32`).
- O recurso compartilhado (`worlds`, `cameras`, `lights`, `field_records`…) é declarado **uma vez** em módulo próprio;
  a deduplicação por objeto de módulo (já existente) e a regra "um símbolo por shader" valem para ele.

**Rationale**: o texto `@group/@binding` é a raiz de A2–A4 e A11 (índices escolhidos à mão, redeclarados com números
diferentes, colisão `g3b6`). Com a declaração como dado, o motor conhece o layout sem regex (o `LayoutInferencer`
passa a ler a declaração; a visibilidade continua por alcance de uso, já correta), a ligação deixa de ser string e o
limite do dispositivo pode ser conferido (R6).

**Alternativas**: (a) manter o texto e só conferir nomes em teste — não resolve a colisão de índices nem dá tipo à
ligação; (b) atributos customizados no WGSL (`@resource(...)`) — exige pré-processar texto (contra FR-009).

### R2 — Frequência de grupo atribuída pelo motor

**Decisão**: cada `WgslResource` declara `frequency`: `frame` (igual para todos os pipelines e passes do quadro:
câmeras, luzes, tempo, registros de pontos de cena), `stage` (igual para os pipelines de um estágio num quadro:
matrizes de mundo, registros e instâncias de desenho, alvos lidos), `batch` (muda entre grupos de desenho: pool de
material com offset dinâmico, registros de função) e `draw` (privado do pipeline ou da geometria: vértices, arestas,
parâmetros por chamada). O grupo de um recurso é o **posto da sua frequência entre as frequências presentes no shader**
(0 = `frame`); a ligação dentro do grupo é a ordem do nome. Duas famílias de pipeline de um estágio com o mesmo
conjunto de recursos `frame`/`stage` têm layouts idênticos nesses grupos (mesmo hash de spec), e o estágio não regrava
esses grupos ao trocar de família.

O estágio deixa de usar índices: o pipeline preparado expõe `groups` por frequência
(`prepared.groupsOf('batch') → { index, spec, dynamic }[]`), e o desenho grava `setBindGroup(g.index, g.spec, …)`
para a frequência que mudou. Nenhum literal de grupo no código de estágio (teste de varredura).

**Rationale**: resolve A11 (troca de família regravando grupos por causa da colisão) e A4 (72 literais), e dá à
especialização por grafo (R9) layouts compatíveis sem coordenação manual. Quatro frequências cabem no mínimo de 4
grupos do WebGPU.

**Alternativas**: grupo por "dono" (câmera, material, geometria) — mais grupos que o limite; um grupo único — perde a
reutilização entre famílias e desenhos.

### R3 — Ligação por declaração, não por nome

**Decisão**: o `provider` de um `WgslResource` diz quem fornece o dado:

- `{ pool: schema }` — o pool da C2 com essa chave (substitui o casamento de `consumes` pelo nome do struct);
- `{ consumer: name }` — um `ConsumerResolver` registrado (tempo, alvos do quadro);
- `{ texture: [schema, descId] }` — textura de um Resource singleton;
- `{ scene: point }` — global de ponto de cena (R4);
- `'private'` — o estágio liga explicitamente **pelo objeto do recurso** (`ctx.bind(new Map([[waterDepth, source]]))`
  ou `kernel.bind({ [res.name]: … })` com o nome tipado vindo do recurso, nunca de string solta).

`PipelineDescriptor.consumes` deixa de existir como lista de nomes: o que o shader consome é o conjunto de recursos
alcançados (R1). `createComputeKernel` recebe `bindings: Map<WgslResource, BindingSource>`; recurso usado sem fonte ou
fonte sem recurso continua erro. `FlowRuntime.lookup` passa a ser: provider declarado → privado do estágio.

**Rationale**: elimina a ligação por string (A3) e a ambiguidade "consumes ambíguo"; renomear uma variável vira erro
de tipo em TypeScript.

### R4 — Pontos de cena para o sombreamento; o forward não conhece água nem sombra

**Decisão**: generalizar o mecanismo de `field`/`space` (globais + `combine`) para **pontos de cena declarados por
Resources**. Dois pontos novos na C3:

- `light_visibility(p: vec3f, n: vec3f, light: u32) -> f32` — produto ordenado das contribuições; pronto devolve `1.0`.
  Contribuintes: a sombra (o `ShadowMap` que projeta — módulo e recursos da sombra, C3) e a água (atenuação por
  cáusticas — módulo e recursos do `WaterSurface`, C4). A ordem do produto é a da declaração (sombra, depois água),
  idêntica à expressão atual `lambert * shadow * caustic` → mesma imagem bit a bit.
- `scene_light(p: vec3f) -> SceneLight` — luz que chega (direção, cor, slot): hoje a luz que projeta sombra ou a
  primeira viva, com a direção padrão como constante única; os sprites e a água passam a usar o mesmo ponto (fim da
  duplicação A12). Na 011, este ponto vira o laço sobre todas as luzes sem tocar os estágios.

Um Resource contribui declarando `getSceneContributions(): { point, module, order }[]`; a C2 compõe os contribuintes
de cada ponto (como faz com funções de `field`) e troca o pronto em todo pipeline que contém o ponto. A escolha "qual
`ShadowMap` projeta" vira dado do Resource (o `ShadowMap` da luz com `castShadow`), lido pela C2 — `castingShadowMap`
deixa de ser importado por estágios. Os parâmetros da sombra e da água (slot, ativo) saem do `ForwardFrameParams`
para os registros dos próprios contribuintes.

**Rationale**: FR-006/FR-007 e SC-003; prepara 011/013 (luzes, céu, transmissão) sem inchar o forward.

**Alternativas**: um "grupo de iluminação" fixo com todos os recursos de cena — é o grupo 3 atual com outro nome.

### R5 — Estágios desacoplados por declaração

**Decisão**: (a) cada estágio seleciona o que desenha pela **família de desenho** declarada pelo pipeline do material
da entidade (`PipelineDescriptor.family`: `surface`, `points`, `wire`, `particle-sprite`, `fluid-surface`), não por
`instanceof` de outros recursos (`ParticleFlow` deixa de pular `SoftBody`/`FluidSurfaceMaterial`); (b) dados produzidos
por um estágio e lidos por outro continuam Resources no World (`WaterSurface`, `FrameTargets`), mas "produzido no
quadro" vira estado genérico da C2 (`produced(descId)`, emitido pelo escritor declarado) no lugar do `markProduced`
privado; (c) WGSL e schemas da água e das cáusticas mudam para `presentation/water/` (dono: `WaterSurface`, C4);
`FluidSurfaceMaterial` continua na C3.

### R6 — Constantes com fonte única e limites conferidos

**Decisão**: `sharedConstant(name, value, type)` (C2) gera ao mesmo tempo o valor TS e um módulo WGSL `const`
(`@workgroup_size(WORKGROUP_SIZE)` é expressão constante válida). Entram: `WORKGROUP_SIZE` (64), `SCAN_GROUP` (256),
`NONE` (`0xFFFFFFFF`, substitui `RECORD_NONE`, `NO_LIGHT_SLOT`, `NO_OWNER`, `ADAPT_NONE`, `SCB_NONE`,
`COLLIDER_NO_OWNER`), `WATER_NO_DEPTH` (1e9 — os limiares `≥ 1e8` passam a `≥ WATER_NO_DEPTH`; profundidades reais
ficam abaixo de 1e8, o resultado não muda), `DEFAULT_LIGHT_DIRECTION`, `MAX_SURFACE_COLLIDERS`, códigos de tipo de
campo. A montagem confere o layout contra os limites do dispositivo (grupos, storage e uniform por estágio, ligações
por grupo) e falha com erro que nomeia o shader e o limite.

### R7 — Sem remendo de texto: variantes por composição e símbolos por instância

**Decisão**: (a) a variante simples/multiamostrada da profundidade da água vira dois `WgslResource`
(`texture_depth_2d` e `texture_depth_multisampled_2d`) com o mesmo nome, escolhidos na composição; (b) a renomeação de
funções de vários contribuintes no mesmo shader (hoje regex) vira **instanciação de módulo** na montagem: um módulo
marcado `instanced` tem os seus símbolos renomeados por token (varredor existente, sem tocar comentários nem
substrings) com o sufixo da instância — recurso do compilador, documentado, não remendo de fonte; (c) `PipelineDescriptor`
ganha `constants` (repassado à C1) para variantes por `override`.

### R8 — Registro de parâmetros tipado

**Decisão**: os parâmetros de uma função de ponto ou de um grafo geram um `StructSchema` próprio
(`<alias>_<hash da forma>`), sem teto de 32 escalares e sem `bitcast`; o pool é por forma
(`<ponto>:<hash>`), ligado pelo provider `{ pool }` nos pipelines daquela forma (os pipelines já são por forma — A9).
Nos pontos de cena com várias funções, cada uma traz o seu pool; a soma de buffers de storage é conferida contra o
limite (R6). Os campos prontos de `field` ganham schema próprio (`FieldBuiltinRecord`) com os códigos de tipo de R6.
As listas posicionais (`camera_fn_list`, `transform_fn_pairs`) viram structs gerados (`CameraFnEntry`,
`TransformFnPair`).

### R9 — Grafo de nós de ponto: compilação em SSA dentro de uma função

**Decisão**: um nó é definido por `defineNode({ name, level: 'point', inputs, outputs, params, code, contexts })`;
`code` é um módulo WGSL com `fn <nome>(entradas…, p: <Params>) -> <Saída>` (struct de saída gerado quando há mais de
uma). O grafo (`NodeGraph`, um Resource) liga portas; a compilação:

1. valida tipos, portas obrigatórias, ciclos (com caminho, atravessando sub-grafos) e contexto (`fragment`, `vertex`,
   `compute`; nós com derivadas de tela só em `fragment`);
2. ordena topologicamente e emite uma função `graph_<hash>(ctx, params)` com um `let` por nó — **cada nó avaliado uma
   vez**, mesmo com saída usada em vários lugares (FR-016); a fusão é sintática, o compilador do driver faz o resto;
3. gera o struct de parâmetros (R8) com campos por nó (`n3_scale`), e o carregador;
4. gera um módulo que **implementa o ponto alvo** (assinatura do `WgslPoint`): entradas do ponto chegam por nós de
   entrada (`point.input('x')`), a saída por um nó de saída. O resto do caminho é o da 009 (`bindPoints`, validação,
   especialização por módulo, `extensionRejected`, troca só quando compila).

A identidade é a forma (definições, ligações, códigos); valores não entram. Sub-grafos são nós cujo código é a função
compilada do sub-grafo (emitida uma vez por shader, deduplicada por módulo). Uma função da 009 é um grafo de um nó
"WGSL" — `TransformFunction`, `MaterialFunction` etc. mantêm a API e passam a construir esse grafo (FR-026).

**Rationale**: custo igual ao escrito à mão (o driver vê o mesmo WGSL em linha), reaproveita todo o caminho de
validação e troca da 009.

**Alternativas**: interpretador de grafo na GPU (bytecode) — mais lento e sem especialização; um pipeline por nó — passes
intermediários.

**Como ficou (US2, 2026-10-16)**: o grafo de ponto é hospedado pela própria função de ponto — `new MaterialFunction({
graph })` (e as outras seis) no lugar de `{ code }`; `setGraph` troca a topologia (revisão +1, compila em transição,
falha mantém o anterior) e `values['nó_parâmetro']` muda valores sem recompilar. Assim os estágios, que acham as
funções pela classe (`slot.entities({ all: [ParametricSurface, SurfaceFunction] })`), servem grafos sem mudança, e a
validação, os pools, a troca e a rejeição são os da 009 — um caminho só. O `NodeGraph` é a forma imutável (nós,
ligações, saída) com `compile(point)`; a função gerada tem o nome e a assinatura do ponto (não `graph_<hash>`), um
`let` por nó dos que a saída alcança, parâmetros por `data.<nó>_<parâmetro>`. As entradas do ponto são nós
`graphArgument(nome, campos)` (saída `value` e uma por campo do struct, ex. `s.world_position`); a saída é a porta
`output`, convertida ao retorno do ponto (escalar → vetor por repetição é a única conversão implícita). Padrões de
entrada são expressões WGSL no escopo da função — o nó `output.surfaceParams` usa as constantes do material (`m`), e o
grafo sem ligações reproduz a função pronta. A função escrita em WGSL não é reescrita como grafo de um nó: código e
grafo são as duas fontes do mesmo módulo gerado; a renomeação nos pontos de cena passou de regex para a renomeação por
token (R7). O saneamento `finite` fica onde a 009 o pôs, nos hospedeiros (transform, camera, emit, surface), igual
para código e grafo. O registro tipado sem teto (R8) chega com a US4; até lá, grafos usam o registro da 009.

### R10 — Grafo de nós de conjunto compilado num Flow

**Decisão**: nós de conjunto (`level: 'set'`) declaram kernels (módulos com ponto de entrada), conjuntos de saída
(schema do elemento, regra de capacidade: igual à entrada, máximo por parâmetro, ou produto de entradas) e a contagem
(`input` ou `gpu`). O `NodeGraph` de conjunto é um Resource cujos descritores **são** os intermediários: cada conjunto
vira um descritor de storage `onDemand` alocado pela C2, e cada contagem um registro `SetCount { count, dispatch[3],
draw[5] }` num descritor `indirect` (escrito só pela GPU). Uma primitiva nova da C3, `CountToArgs`, converte contagem
em argumentos de despacho e de desenho no próprio fluxo.

A compilação produz um `GraphFlow` (C2, subclasse de `Flow`) registrado por fábrica com a fase declarada pelo grafo
(ex.: `transform`, antes da sombra e do forward):

- slots = entradas e saídas do grafo (pools, singletons, a geometria de saída com `owns`);
- estados `stale | clean`: parâmetros (`poolWritten` do registro do grafo), entradas (`resourceReady`, `poolWritten`)
  ou nós dependentes de tempo deixam `stale`; `frameRecorded` volta a `clean` — a memória escrita à mão hoje (A18)
  vira comportamento do `GraphFlow` (FR-020);
- `dispatch` grava os passes em ordem topológica; nós com contagem da GPU despacham por `workgroupsIndirect`;
- entradas de grafo de ponto num nó de conjunto são compiladas (R9) e fundidas no kernel do nó (FR-018).

As primitivas `PrefixSum`, `RadixSort`, `Compaction`, `Reduce` ganham a variante de contagem da GPU (lida do
`SetCount` no próprio kernel) e são expostas como nós (FR-027). `GraphColorer` (assíncrono, com leitura de volta)
entra como nó de preparação, fora do quadro.

**Saída de malha**: um nó `meshOutput` escreve num `GraphGeometry` (Geometry com vértices, índices e `indirect`
`upload: 'never'`, possuída pelo `GraphFlow`), desenhado pelo caminho existente da `ParametricSurface` (A16) — sem
estágio por origem. O vértice de 32 B é lido e escrito como `array<MeshVertex>` com **campos `f32` escalares**
(`px…pz`, `nx…nz`, `u`, `v`), que têm o mesmo layout de 32 B do buffer de vértices — o que torna a malha legível em
compute sem offsets à mão (resolve também `wire.wgsl` e `point_sprite.wgsl`, A19) sem mudar o pipeline de desenho.

**Rationale**: o grafo de conjunto é exatamente um Flow (slots + passes + transições); a C2 já sabe alocar descritores
de Resource e conhecer escritores — falta só a contagem na GPU e a memória genérica.

### R11 — Serialização

**Decisão**: `NodeGraph.toJSON()` → `{ version, nodes: [{ id, type, params }], links: [[de, porta, para, porta]],
outputs, subgraphs }`; `NodeGraph.fromJSON(json, registry)` resolve tipos pelo `NodeRegistry` da C2 (bibliotecas da C3
registram os seus nós; nós WGSL do usuário serializam o código). A identidade (hash da forma) é a mesma antes e depois.

### R12 — Biblioteca base

**Decisão**: na C3 (`elements/nodes/`): entradas de contexto (amostra de superfície, vértice, partícula, célula,
tempo, câmera, posição de mundo), matemática escalar e vetorial (aritmética, `mix`, `clamp`, `smoothstep`, potência,
trigonometria, produto escalar e vetorial, normalizar, comprimento), mapeamentos (faixa, curva por pontos, rampa de
cor), ruídos (valor, gradiente, celular, fBm — sobre `wgslLib.noise`), condições (comparação, `select`), conversões de
espaço (objeto/mundo/vista), amostragem de campo da cena (`field`), geometria diferencial (métrica, curvaturas,
direção principal da 010); nós de conjunto: grade, deslocar, recalcular normais, distribuir pontos por densidade,
realizar instâncias (copiar uma malha por ponto), soma de prefixos, ordenação, compactação, redução, `meshOutput`,
`pointsOutput`. Cada nó tem referência de CPU em TypeScript e teste em amostras fixas.

### R13 — Migração sem mudar imagem nem física

**Decisão**: a migração é mecânica e verificada bit a bit: todas as fixtures (imagens exatas, manifestos por hash,
trajetórias) devem passar **sem regravar** (SC-005). A aritmética dos shaders não muda (só declarações, ligações e
organização); onde há troca de constante (R6), a equivalência é demonstrada no teste. Ordem: núcleo (R1–R3, R6–R7) →
migração de todos os módulos e estágios → pontos de cena (R4, R5) → registros tipados (R8) → grafo de ponto (R9) →
grafo de conjunto (R10–R11) → biblioteca (R12) → documento.

### R14 — Medidas e vídeos

**Decisão**: smoke novo `nodeGraphs` (fonte e `--dist`): (a) grafo de ponto com ramificação contra a mesma regra em
WGSL à mão (≤ 1 ULP por canal) e GPU por quadro igual dentro do ruído; (b) grafo de conjunto "grade → deslocar por
ruído → normais → distribuir pontos por densidade → realizar esferas" contra referência da CPU (contagem exata,
posições e normais ≤ 1e-5), sem leitura de volta por quadro; (c) 1 000 entidades com o mesmo sub-grafo → 1 compilação,
1 pipeline; (d) 60 s mudando parâmetro → 0 recompilações; troca de topologia sem quadro quebrado; (e) serialização
ida e volta bit a bit. Testes de varredura (CPU): zero `@group/@binding` em módulos, zero literal de grupo em
estágios, zero importação entre estágios, zero constante compartilhada duplicada, zero globais implícitos (cada módulo
monta sozinho). Cena de bench `graph-geometry`. Vídeos: geometria procedural da US3 animada; grafo de ponto animando
cor e deslocamento; parâmetro mudando ao vivo.
