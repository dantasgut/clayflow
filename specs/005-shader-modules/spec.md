# Feature Specification: Núcleo de shaders

**Feature Branch**: `feature/005-shader-modules`

**Created**: 2026-10-11

**Status**: Implementada (2026-10-12) — gate completo verde; 13 smokes no código-fonte e com `--dist`; `bench:check` pendente de rodada com a máquina sem carga externa (T084)

**Input**: User description: "Núcleo de shaders (spec 005, fase F1 do roadmap — `005-shader-modules`). Implementar no
lugar arquitetural certo (refundação C1–C4), sem helpers nem atalhos, o núcleo de shaders do ROADMAP §4.2: módulos WGSL
com dependências e deduplicação por símbolo; structs WGSL gerados do `StructSchema` (marcadores `{{struct:X}}`), sem
duplicação TS↔WGSL; núcleo de matemática consolidado (`quat`, `mat`, `linalg`, `sdf`, `sph_kernels`, `mpm_weights`,
`xpbd`, `lcp`, `noise`, `color`, `brdf`); kernels genéricos (prefix sum, radix sort, compactação, reduções, coloração de grafo) com a busca
de vizinhança e a compactação de contatos do LCP migradas para eles; WGSL órfão resolvido com inventário (matemática
extraída para módulos, cascas de kernel do legado removidas); decisão D5 —
documento de arquitetura corrigido, preparando a 006. Medido contra o baseline regravado na 004."

---

## Contexto e Problema

A refundação ([arquitetura C1–C4](../../clay-engine-doc/docs/guides/architecture_resource_loaders.md)) prevê que o
código de GPU seja composto a partir de peças reutilizáveis: structs declarados uma vez e gerados para o shader,
bibliotecas de matemática compartilhadas, marcadores `{{struct:X}}` resolvidos pelo motor. A auditoria do
[roadmap](../ROADMAP.md) (§3.1, §3.3, §4.2) mostra que nada disso existe:

- **Shaders montados por colagem de texto.** Cada estágio concatena, à mão e em ordem fixa, os arquivos de struct, as
  bibliotecas e o kernel. Não há declaração de dependências nem deduplicação: quem esquece uma biblioteca descobre na
  compilação do pipeline, em tempo de execução; quem inclui duas vezes recebe "símbolo redefinido"; a ordem de inclusão
  é conhecimento implícito repetido em cada estágio.
- **Structs escritos duas vezes.** O layout de cada dado de GPU existe uma vez em TypeScript (o schema que empacota os
  bytes) e outra vez num arquivo WGSL escrito à mão (22 arquivos). Nada garante que os dois concordem — uma divergência
  de campo ou de alinhamento corrompe a simulação em silêncio. Vários dados internos (parâmetros de simulação,
  contatos, níveis da soma de prefixos) nem têm schema: são empacotados com offsets escritos à mão. O gerador de WGSL
  existente produz tipos inválidos (`u16`) e não conhece as regras de layout de uniform e storage.
- **Matemática duplicada.** Funções de matriz 3×3 existem em 3 arquivos; os núcleos de suavização do PBF (`W_poly6`,
  `grad_W_spiky`) estão copiados em 3 kernels, fora da biblioteca SPH que já existe; não há módulos de ruído, cor ou
  BRDF — o render reimplementa o que precisa dentro do próprio shader.
- **Algoritmos paralelos sem núcleo comum.** A soma de prefixos em vários níveis vive dentro da busca de vizinhança; a
  compactação por contador atômico vive dentro da narrowphase do LCP (ambas da 004). Não existe ordenação na GPU nem
  redução reutilizável — cada nova capacidade (culling, partículas, conteúdo procedural, broadphase) teria de
  reescrevê-los.
- **WGSL órfão.** 23 de 90 arquivos WGSL, portados do legado, não são usados por nenhum estágio. A matemática deles
  tem valor (FEM por XPBD com restrições hidrostática e desviadora, decomposição polar, XPBD paralelo por coloração e
  por Jacobi), mas os kernels foram escritos para o modelo antigo: dependem do collider único de 160 B (dois nem
  compilam), do UBO por objeto, de vertex buffer intercalado fixo e de estado de um único corpo; vários são seriais
  (uma thread); `vertex_write` existe em 3 cópias, `mat3_*` em 3 arquivos, `ColorRange` em 2 layouts conflitantes, e o
  acumulador atômico em ponto fixo do Jacobi repete o padrão que o LCP já usa. Nenhum é compilado nem testado.
- **Física que nunca rodou** (descoberto ao gravar as fixtures de trajetória): os kernels de colisão do SPH, do PBF
  e do MPM ainda usam o collider único do legado, que não existe mais; o pipeline é inválido e invalida o quadro
  inteiro — **nenhum fluido simula**. O XPBD padrão é criado sem o pool de restrições e ignora o `DistanceConstraint`.
  Nenhum smoke conferia que essas cenas se movem. A fixture de "antes" precisa registrar física que funciona.
- **Documento de arquitetura com contradições** (decisão D5 do roadmap): modelo de transição de estado, exemplos com a
  API antiga por `id`, `pack` listado após remoção, "o desenvolvedor não escreve Flows" × `Flow` público,
  `register(factory)` × instância, `add(stage, {before/after})` × ordem de registro, `Scene.add` retornando `this` ×
  `EntityId`, pool `Renderable` não definido, Material `individual` × pool key de material, ponte pool de partículas →
  geometria não especificada. A 006 (slots de Flow) implementa exatamente essas definições e não pode partir de um
  documento contraditório.

Esta spec entrega o núcleo de shaders e corrige o documento. Não muda o comportamento visível: a simulação e a imagem
devem ser as mesmas antes e depois.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Shaders compostos por módulos com dependências declaradas (Priority: P1)

Quem escreve um estágio do motor (ou, no futuro, uma extensão) declara de quais módulos o seu kernel depende e recebe
o código completo, na ordem certa, com cada símbolo definido uma única vez. Dependências ausentes, ciclos e símbolos
conflitantes são apontados com uma mensagem legível no momento em que o shader é montado — antes de qualquer
compilação na GPU.

**Why this priority**: É a base de todas as outras histórias e da 006: structs gerados, matemática consolidada e
kernels genéricos só se compõem se houver resolução de dependências e deduplicação.

**Independent Test**: Montar um shader a partir de módulos com dependências em diamante, comparar o resultado com a
ordem topológica esperada e verificar que cada símbolo aparece uma vez; provocar ciclo, dependência ausente e símbolo
conflitante e conferir as mensagens. Todos os estágios do motor compilam e os testes e smokes passam com os shaders
montados por módulos.

**Acceptance Scenarios**:

1. **Given** um módulo A que depende de B e C, ambos dependentes de D, **When** o shader de A é montado, **Then** D
   aparece uma vez, antes de B e C, que aparecem antes de A.
2. **Given** um ciclo A → B → A, **When** a montagem é pedida, **Then** um erro nomeia o ciclo completo.
3. **Given** dois módulos distintos que definem o mesmo símbolo, **When** ambos entram no mesmo shader, **Then** um erro
   nomeia o símbolo e os dois módulos.
4. **Given** dois módulos distintos com o mesmo nome no mesmo grafo, **When** a montagem é pedida, **Then** um erro
   nomeia o nome repetido e quem depende de cada um.
5. **Given** todos os estágios do motor (física, transformações, render, pós-processamento, UI), **When** o motor roda,
   **Then** nenhum monta shader por concatenação manual de texto.

---

### User Story 2 - Um único lugar para cada layout de dados de GPU (Priority: P1)

O layout de cada dado de GPU é declarado uma vez, no schema. O struct WGSL correspondente é gerado a partir dele,
respeitando as regras de alinhamento de uniform e de storage, e entra no shader pelo marcador `{{struct:Nome}}` ou como
dependência de módulo. Não há mais arquivo de struct escrito à mão nem offset empacotado à mão.

**Why this priority**: Elimina uma classe inteira de erros silenciosos (TS e WGSL discordando) e é o que a 006 consome
para compor os shaders a partir do que cada Flow lê.

**Independent Test**: Para cada schema, gerar o WGSL e verificar, compilando na GPU e lendo de volta, que os offsets e
o tamanho do struct batem com o empacotamento do schema; verificar que nenhum arquivo de struct WGSL escrito à mão
permanece e que todos os dados internos (parâmetros, contatos, níveis de scan) têm schema.

**Acceptance Scenarios**:

1. **Given** um schema com campos escalares, vetores, matrizes e arrays, **When** o WGSL é gerado para storage e para
   uniform, **Then** o struct compila e cada campo fica no mesmo offset em que o schema o empacota.
2. **Given** um schema com tipo sem representação direta em WGSL (`u16`, `i16`), **When** o WGSL é gerado, **Then** o
   resultado é válido (tipo empacotado de forma documentada) ou a criação do schema falha com mensagem legível — nunca
   WGSL inválido.
3. **Given** um kernel que usa `{{struct:Nome}}`, **When** o shader é montado, **Then** o marcador é substituído pelo
   struct gerado, uma única vez, mesmo que vários módulos o peçam.
4. **Given** um marcador de struct sem schema registrado, **When** o shader é montado, **Then** um erro nomeia o
   marcador e o módulo.
5. **Given** os parâmetros por passo da física (regiões com offset dinâmico, spec 004), **When** são gravados, **Then**
   o empacotamento usa o schema, sem offsets numéricos escritos à mão.

---

### User Story 3 - Matemática de GPU consolidada e compartilhada (Priority: P2)

Quaternions, matrizes, álgebra linear, SDFs, núcleos de suavização SPH, pesos do MPM, restrições XPBD, utilidades do
LCP, ruído, cor e BRDF existem cada um em um único módulo, usado tanto por compute quanto por render. Nenhuma função
matemática é definida em mais de um lugar.

**Why this priority**: Reduz manutenção e é pré-requisito dos pontos de extensão matemáticos (F2+), mas não muda
comportamento; vem depois da infraestrutura das histórias 1 e 2.

**Independent Test**: Varredura automática não encontra nenhuma função WGSL definida em mais de um arquivo; cada
módulo de base tem testes de valores de referência executados na GPU; a trajetória das cenas de física é a mesma
antes e depois da consolidação.

**Acceptance Scenarios**:

1. **Given** os 12 módulos de base, **When** a biblioteca é carregada, **Then** cada um está registrado, compila
   isoladamente com suas dependências e passa nos testes de valores de referência.
2. **Given** os kernels do PBF, **When** são montados, **Then** usam os núcleos de suavização do módulo SPH, sem cópia
   local.
3. **Given** uma cena de física (corpos rígidos, XPBD, FEM, MPM, SPH, PBF) executada com um número fixo de passos,
   **When** comparada antes e depois da consolidação, **Then** as posições finais são idênticas bit a bit, ou, onde a
   consolidação trocar uma implementação duplicada divergente pela canônica, ficam dentro da tolerância registrada na
   pesquisa com a justificativa.
4. **Given** o shader de render e o de pós-processamento, **When** são montados, **Then** as funções de cor e de
   iluminação vêm dos módulos `color` e `brdf`, e a imagem final é a mesma de antes.

---

### User Story 4 - Kernels genéricos de algoritmos paralelos (Priority: P2)

O motor oferece, como peças reutilizáveis, soma de prefixos em vários níveis, ordenação radix de chaves (com valores
associados), compactação por contador atômico, reduções (soma, mínimo, máximo), acumulação atômica em ponto fixo e
coloração de grafo. A busca de vizinhança e o LCP (compactação de contatos e acumulação das correções) passam a
usá-los em vez de terem cópias próprias.

**Why this priority**: É a base comum de física, culling, partículas e conteúdo procedural das fases seguintes; a
migração dos dois consumidores atuais prova as peças em uso real.

**Independent Test**: Cada kernel é validado na GPU contra uma referência em CPU para tamanhos pequenos, não potências
de dois e grandes (acima do limite de grupos por dimensão); a busca de vizinhança e o LCP dão os mesmos resultados e o
mesmo desempenho (ou melhor) que na 004.

**Acceptance Scenarios**:

1. **Given** N chaves u32 aleatórias com valores associados, N de 1 a 4 milhões, **When** ordenadas, **Then** o
   resultado é igual à ordenação estável em CPU.
2. **Given** um array de N elementos, **When** a soma de prefixos (exclusiva e inclusiva) é calculada, **Then** é igual
   à referência em CPU, inclusive acima de 65 536 grupos.
3. **Given** um predicado sobre N elementos, **When** compactados, **Then** sai exatamente o conjunto dos elementos
   aceitos e a contagem correta; capacidade excedida é informada, sem escrita fora do buffer.
4. **Given** N valores, **When** reduzidos por soma, mínimo e máximo, **Then** o resultado bate com a CPU (soma dentro
   da tolerância de ponto flutuante documentada).
5. **Given** um grafo de restrições (pares de índices) com N arestas, **When** colorido, **Then** nenhuma cor contém
   duas arestas que compartilham vértice, todas as arestas recebem cor e o número de cores fica dentro do limite
   documentado (proporcional ao grau máximo).
6. **Given** contribuições f32 de várias threads para o mesmo alvo, **When** acumuladas em ponto fixo, **Then** o
   resultado bate com a soma em CPU dentro da resolução da escala, e saturação é informada.
7. **Given** a busca de vizinhança e o LCP, **When** executados, **Then** usam os kernels genéricos e os smokes `limits`
   e `rigidContacts` passam com os mesmos critérios e tempos não piores que os da 004.

---

### User Story 5 - WGSL do legado reconciliado com a arquitetura (Priority: P3)

Os 23 arquivos WGSL órfãos, portados do legado, são reconciliados com a arquitetura atual: a matemática reutilizável
vira módulo da biblioteca, sem duplicação e com testes de referência; as cascas de kernel escritas para o modelo antigo
são removidas, e um inventário registra, para cada arquivo, o que foi extraído, o motivo da remoção e a fase que vai
escrever o estágio correspondente sobre os módulos e kernels genéricos.

**Why this priority**: Não muda comportamento, mas deixa a biblioteca com o que é reutilizável de verdade e prepara as
fases que usam essa matemática (ponte simulação → render na F2; FEM elástico, XPBD paralelo e shape matching na F5).

**Independent Test**: Uma verificação automática falha se algum arquivo WGSL não for usado por um estágio nem
registrado como módulo; os módulos extraídos passam nos testes de referência na GPU; o inventário cobre os 23 arquivos.

**Acceptance Scenarios**:

1. **Given** a matemática de FEM (cinemática do tetraedro, gradientes hidrostático e desviador, delta de λ), **When**
   extraída, **Then** forma o módulo `fem`, com dependências declaradas, e passa nos testes de referência na GPU.
2. **Given** a decomposição polar e as operações de matriz 3×3 espalhadas, **When** consolidadas, **Then** existem só em
   `mat`/`linalg`, uma vez cada.
3. **Given** o acumulador atômico em ponto fixo do Jacobi e o do LCP, **When** consolidados, **Then** ambos os padrões
   viram o kernel genérico de acumulação (US4), usado pelo LCP.
4. **Given** um kernel que depende de estruturas que não existem mais (collider único, UBO por objeto, vertex
   intercalado fixo, estado de um único corpo) ou que é serial, **When** o inventário é aplicado, **Then** ele é removido
   e o inventário registra o motivo e a fase que o reescreve.
5. **Given** a verificação de órfãos, **When** alguém adiciona um WGSL sem uso nem registro, **Then** o gate falha.

---

### User Story 6 - Documento de arquitetura sem contradições (Priority: P3)

Quem vai implementar a 006 (e quem usa o motor) lê um documento de arquitetura coerente com o roadmap (§4) e com o
código: cada uma das 10 inconsistências da decisão D5 está resolvida, e o documento descreve o núcleo de shaders
entregue nesta spec.

**Why this priority**: Não muda código, mas bloqueia a 006; entra nesta spec por decisão do roadmap.

**Independent Test**: Revisão item a item das 10 inconsistências, com a seção corrigida citada para cada uma no
registro da spec; nenhum exemplo do documento usa API que não existe.

**Acceptance Scenarios**:

1. **Given** cada item da D5, **When** o documento é revisado, **Then** há uma única definição, alinhada ao roadmap §4,
   e o registro da spec aponta a seção.
2. **Given** os exemplos de código do documento, **When** comparados à API pública, **Then** nenhum usa a API antiga por
   `id` nem métodos removidos.
3. **Given** a seção de shaders do documento, **When** lida, **Then** descreve módulos, dependências, deduplicação,
   structs gerados e `{{struct:X}}` como implementados.

---

### Edge Cases

- Módulo que depende de si mesmo (ciclo de tamanho 1): erro de ciclo.
- Dois módulos distintos com o mesmo nome no mesmo grafo: erro na montagem, nomeando o nome repetido.
- Mesmo módulo pedido por caminhos diferentes do grafo: incluído uma vez.
- Símbolo definido por um módulo e redefinido pelo kernel que o usa: erro de conflito (nenhuma sobrescrita silenciosa).
- Struct com campo de array de tamanho em tempo de execução: só permitido como último campo e só em storage; em
  uniform, erro legível.
- Schema usado em uniform com campo que viola o alinhamento de uniform (ex.: array de escalares): padding gerado
  conforme a regra, ou erro legível — o empacotamento e o WGSL sempre concordam.
- Coloração de grafo com laços (aresta i–i), arestas repetidas e vértices isolados: laços rejeitados com mensagem,
  repetidas coloridas corretamente, isolados ignorados.
- Ordenação com N = 0, N = 1 e todas as chaves iguais: resultado correto, sem despacho vazio inválido.
- Soma de prefixos e compactação com N maior que o limite de grupos por dimensão (respeitando o despacho linear da
  004).
- Redução de soma em ponto flutuante: ordem de soma diferente da CPU — tolerância relativa documentada.
- Montagem do mesmo shader várias vezes: resultado idêntico (determinístico), e a identidade da spec do pipeline (004)
  continua deduplicando.
- Build minificado: nomes de módulos e de structs não dependem de nomes de classes ou funções do JavaScript.

## Requirements _(mandatory)_

### Functional Requirements

**Módulos WGSL (US1)**

- **FR-001**: O motor MUST oferecer um módulo WGSL com nome único, código-fonte e lista de dependências por
  referência a outros módulos (o nome identifica o módulo nas mensagens).
- **FR-002**: A montagem de um shader MUST resolver as dependências em ordem topológica determinística e incluir cada
  módulo uma única vez.
- **FR-003**: A montagem MUST detectar e rejeitar, com mensagem que nomeia os envolvidos: ciclo, dependência não
  registrada, símbolo de nível superior (função, struct, constante, alias, variável de módulo) definido por mais de um
  módulo, e nome de módulo registrado duas vezes.
- **FR-004**: Todos os estágios do motor (física, transformações, render, sombra, pós-processamento, UI, busca de
  vizinhança) MUST montar seus shaders pela composição de módulos; nenhum MUST concatenar fontes manualmente.
- **FR-005**: A montagem MUST ser determinística: as mesmas entradas produzem o mesmo texto, preservando a
  deduplicação de pipelines por identidade de spec da 004.
- **FR-006**: A montagem MUST ocorrer na criação do recurso de GPU (pipeline/kernel), nunca por quadro.

**Structs gerados (US2)**

- **FR-007**: O schema de struct MUST gerar a definição WGSL do struct para os layouts de storage e de uniform,
  aplicando as regras de alinhamento e tamanho de cada um, de modo que os offsets do WGSL coincidam com os do
  empacotamento.
- **FR-008**: Tipos sem representação direta em WGSL MUST gerar WGSL válido, com a representação documentada, ou ser
  rejeitados na criação do schema com mensagem legível.
- **FR-009**: Marcadores `{{struct:Nome}}` em módulos MUST ser substituídos pelo struct gerado do schema registrado com
  esse nome, uma única vez por shader; marcador sem schema MUST falhar com mensagem legível.
- **FR-010**: Todo dado lido ou escrito pela GPU MUST ter seu layout declarado em um schema único — inclusive
  parâmetros de simulação, parâmetros por passo, contatos, estado de warm start e níveis de scan; os arquivos de struct
  WGSL escritos à mão MUST ser removidos.
- **FR-011**: O empacotamento de dados para a GPU MUST usar o schema; offsets numéricos escritos à mão MUST ser
  eliminados.

**Matemática consolidada (US3)**

- **FR-012**: O motor MUST registrar os módulos de base `quat`, `mat`, `linalg`, `sdf`, `sph_kernels`, `mpm_weights`,
  `xpbd`, `lcp`, `fem`, `noise`, `color` e `brdf`, cada um com suas dependências declaradas.
- **FR-013**: Nenhuma função WGSL MUST ser definida em mais de um arquivo; uma verificação automática no gate MUST
  garantir isso.
- **FR-014**: Os kernels do PBF MUST usar os núcleos de suavização do módulo SPH; as funções de matriz 3×3 MUST existir
  só no módulo `mat`/`linalg`; SDFs só em `sdf`.
- **FR-015**: Os shaders de render e de pós-processamento MUST obter funções de cor (espaços de cor, tone mapping) e de
  iluminação dos módulos `color` e `brdf`, sem mudar a imagem produzida.
- **FR-016**: O módulo `noise` MUST oferecer ruído de valor/gradiente determinístico em 2D e 3D e hash inteiro, com
  valores de referência testados na GPU.
- **FR-017**: Cálculos que a CPU repete a partir de funções que já existem em módulo WGSL dentro de estágios de C3
  MUST ser auditados; a duplicação que pertence a esta spec MUST ser removida, e a que pertence a outra fase (câmera e
  sombra — 006/F2) MUST ser registrada no inventário com a fase.
- **FR-018**: Cada módulo de base MUST ter testes de valores de referência executados na GPU (smoke da biblioteca).

**Kernels genéricos (US4)**

- **FR-019**: O motor MUST oferecer soma de prefixos exclusiva e inclusiva em vários níveis, sem teto de tamanho além
  dos limites de buffer do dispositivo.
- **FR-020**: O motor MUST oferecer ordenação radix estável de chaves u32 com valores u32 associados.
- **FR-021**: O motor MUST oferecer compactação por predicado com contador atômico, capacidade de saída explícita e
  aviso de excedente sem escrita fora do buffer.
- **FR-022**: O motor MUST oferecer reduções de soma, mínimo e máximo sobre u32, i32 e f32.
- **FR-023**: O motor MUST oferecer acumulação atômica de contribuições f32 em ponto fixo (escala configurável,
  detecção de saturação), substituindo as cópias do LCP e do Jacobi do legado.
- **FR-024**: O motor MUST oferecer coloração de grafo na GPU sobre uma lista de arestas (pares de índices), produzindo
  a cor de cada aresta e os intervalos por cor, sem duas arestas da mesma cor compartilhando vértice.
- **FR-025**: Todos os kernels genéricos MUST respeitar o despacho linear dentro do limite por dimensão (004) e
  funcionar para N = 0.
- **FR-026**: A busca de vizinhança MUST usar a soma de prefixos genérica e a narrowphase do LCP MUST usar a
  compactação e a acumulação atômica genéricas, sem cópias próprias desses algoritmos.
- **FR-027**: Os kernels genéricos MUST ser expostos como peças do núcleo (C3) para os estágios do motor, com
  documentação de entrada, saída e limites.

**WGSL do legado (US5)**

- **FR-028**: A matemática reutilizável dos órfãos MUST ser extraída para módulos da biblioteca (`fem`; decomposição
  polar e operações 3×3 em `mat`/`linalg`; acumulação em ponto fixo no kernel genérico), sem duplicação e com testes de
  referência na GPU.
- **FR-029**: As cascas de kernel escritas para o modelo antigo MUST ser removidas: corpo rígido por posição (`rb_solve`,
  `rb_solve_velocity`, `rb_velocity_recovery`, `rb_substep_update`), `rb_update_colliders`, `fem_collision`,
  `contact_manifold`, `collision` (colisão de partículas XPBD sobre o collider único), as três `*_vertex_write`, `rb_sync_transform`, `fem_solve`, `distance_solve_color`,
  `distance_solve_jacobi`, `jacobi_apply`, `shape_match_transform`, `shape_correct` e `fem_element` — depois de extraída
  a matemática que contêm.
- **FR-030**: Um inventário MUST registrar, para cada um dos 23 arquivos: o que foi extraído e para qual módulo, o motivo
  da remoção (dependência do modelo antigo, serial, duplicado) e a fase que escreve o estágio correspondente (F2: ponte
  simulação → render; F5: FEM elástico com colisão, colisão e solve paralelo do XPBD, shape matching, solver do `XPBDRigidSchema`).
- **FR-031**: Uma verificação automática no gate MUST falhar se algum arquivo WGSL não for usado por um estágio nem
  registrado como módulo; todo módulo registrado MUST compilar na GPU no smoke da biblioteca.

**Documento de arquitetura (US6)**

- **FR-032**: O documento de arquitetura MUST resolver cada uma das 10 inconsistências da D5 com uma definição única,
  alinhada ao roadmap §4, e o registro da spec MUST apontar a seção corrigida de cada uma.
- **FR-033**: Os exemplos de código do documento MUST usar só a API pública existente (ou a API definida para a 006,
  marcada como tal).
- **FR-034**: O documento MUST descrever o núcleo de shaders entregue (módulos, dependências, deduplicação, structs
  gerados, kernels genéricos).
- **FR-035**: Onde o código contradiz a regra que o próprio documento define, o código MUST ser corrigido junto:
  `resolve(bodyType)` devolve o Flow de maior prioridade (hoje devolve o último registrado) e `Scene.add(entity)`
  insere a entidade no World (hoje só anexa como filho, sem inserir).

**Física quebrada encontrada na gravação das fixtures**

- **FR-036**: SPH, PBF e MPM MUST colidir com os pools tipados de colliders (plano, caixa, esfera), com a pose do
  collider vinda do corpo dono quando houver, pelo mesmo conjunto de colliders que o LCP usa (sem cópia da montagem
  dos mapas de dono); `MeshCollider` segue sem contato, como no LCP (registrado para a F5).
- **FR-037**: Os fluidos MUST ser fisicamente coerentes: parâmetros de material de partícula declarados num recurso
  do World em vocabulário de domínio (densidade de repouso, espaçamento, viscosidade, velocidade do som, módulo de
  Young, Poisson, restituição, domínio), com massa, raio de suavização, grade e passo estável derivados dele; PBF com
  massa na densidade e no gradiente da restrição; SPH com vizinhança no suporte do núcleo; MPM com massa/volume do
  material, material de fluido distinto do elástico e substeps pelo passo estável; fachadas criando partículas MPM
  com gradiente de deformação identidade.
- **FR-038**: O XPBD padrão MUST resolver as restrições de distância inseridas no World (`DistanceConstraint`).
- **FR-039**: O smoke de trajetórias MUST reprovar se uma cena não simula (sem movimento, valores não finitos ou erro
  capturado de estágio) e MUST conferir o comportamento físico esperado de cada cena (fluidos assentam sobre o chão,
  corrente XPBD pendura do ponto fixo sem esticar além da tolerância, corpos rígidos repousam sobre o chão).

**Transversais**

- **FR-040**: A simulação MUST produzir a mesma trajetória antes e depois desta spec: idêntica bit a bit, ou dentro de
  tolerância registrada na pesquisa onde uma implementação duplicada divergente for trocada pela canônica.
- **FR-041**: A imagem renderizada das cenas do bench MUST ser a mesma antes e depois.
- **FR-042**: O build minificado MUST funcionar: nomes de módulos e structs são dados explícitos, não nomes de classe.

### Key Entities

- **Módulo WGSL**: unidade de código de GPU com nome único, fonte e dependências por nome; define símbolos de nível
  superior; pode conter marcadores de struct.
- **Biblioteca de módulos**: registro dos módulos disponíveis; resolve nomes, detecta conflitos e monta shaders.
- **Schema de struct**: declaração única do layout de um dado de GPU; empacota bytes e gera o struct WGSL para storage e
  uniform.
- **Kernel genérico**: peça de algoritmo paralelo (scan, sort, compactação, redução, acumulação em ponto fixo,
  coloração de grafo) com entradas, saídas, capacidade e
  limites documentados, reutilizável por qualquer estágio.
- **Inventário de WGSL**: registro, por arquivo do legado, do que foi extraído e para onde, do motivo da remoção e da
  fase que escreve o estágio correspondente.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 0 estágios montam shader por concatenação manual; 100% dos shaders do motor vêm da composição de módulos.
- **SC-002**: 0 arquivos de struct WGSL escritos à mão; 100% dos structs usados em shaders gerados de schema, com
  offsets conferidos na GPU para cada schema.
- **SC-003**: 0 funções WGSL definidas em mais de um arquivo (verificação automática no gate).
- **SC-004**: 0 arquivos WGSL órfãos; inventário cobre os 23 arquivos; matemática de FEM, decomposição polar e
  acumulação em ponto fixo disponíveis como módulos/kernels testados.
- **SC-005**: Ordenação de 4 milhões de pares chave/valor, soma de prefixos e compactação de 4 milhões de elementos,
  reduções, acumulação em ponto fixo e coloração de grafo (1 milhão de arestas) corretas contra a CPU em 100% dos casos de teste, inclusive tamanhos não potência de dois e acima de 65 536
  grupos.
- **SC-006**: Trajetórias de física idênticas antes/depois (ou dentro da tolerância registrada) em todas as cenas de
  física dos smokes.
- **SC-007**: `npm run bench:check` sem regressão contra o baseline regravado na 004; smokes `limits` e `rigidContacts`
  com tempo por quadro não pior que o registrado na 004.
- **SC-008**: As 10 inconsistências da D5 resolvidas, cada uma com a seção citada no registro da spec.
- **SC-009**: Gate completo verde; build minificado funciona; todos os smokes passam, inclusive com `--dist`.
- **SC-010**: As sete cenas de física simulam e passam nos critérios físicos do smoke de trajetórias antes da
  gravação das fixtures (fluidos acima do chão, corrente com elos dentro de 5% do comprimento de repouso).

## Assumptions

- A composição de shaders acontece em CPU na criação dos recursos de GPU; não há custo por quadro, então o bench não deve
  mudar — o critério de desempenho é "sem regressão", não melhoria.
- O caso citado no roadmap de `quat_to_mat4` reescrito em TypeScript no `LCPFlow` não existe mais desde a 003 (a pose
  chega ao `Transform`, que é composto na GPU); a matemática de câmera e de sombra ainda feita em CPU pertence à
  composição de câmera e à migração do forward/sombra (006/F2) e fica registrada no inventário (FR-017).
- Os kernels órfãos foram portados do legado sem adaptação (a única mudança foi o despacho linear da 004). Não são
  ligados a estágios nesta spec: os estágios que os substituem são escritos nas fases donas (F2 e F5) sobre os módulos
  e kernels genéricos entregues aqui. O histórico do git preserva os arquivos removidos.
- `rb_solve` e auxiliares são um solver de corpo rígido por posição (estilo XPBD), não o LCP antigo. O `XPBDRigidSchema`
  existe sem solver de corpo rígido (o `XPBDFlow` só tem kernels de partículas) — achado registrado para a F5.
- O XPBD atual não colide com colliders (o kernel `collision` do legado é órfão e depende do collider único) —
  achado registrado para a F5.
- O FEM atual só integra gravidade (sem solve elástico); o solve elástico é da F5 e usará o módulo `fem` e a coloração
  de grafo desta spec.
- O módulo `brdf` nesta spec contém a iluminação que o render usa hoje (Lambert) e as funções de BRDF que o roadmap
  prevê para a F4 apenas na medida em que já existam no código; o PBR completo é da F4.
- A ordenação radix nesta spec não substitui algoritmos existentes por ordenação (a busca de vizinhança continua por
  contagem); é oferecida como peça do núcleo e validada no smoke da biblioteca, para os consumidores das fases
  seguintes (culling, partículas, broadphase).
- "Mesma trajetória" é verificado executando cada cena de física por um número fixo de passos com `app.step()` e
  comparando o estado lido de volta com o gravado antes da consolidação.
- Os kernels genéricos ficam em C3 (`elements/gpu`), usados pelos estágios; não são expostos na fachada de domínio (N0)
  nesta spec.

## Out of Scope

- Slots de Flow, `consumes`/`ConsumerResolver`, `LayoutInferencer` e migração do forward/sombra para slots (006).
- Pontos de extensão matemáticos do usuário (`transform`, `camera`, `surface`, `space`, `field`, `material`, `emit`) —
  F2 em diante.
- Módulos novos `parametric`, `space`, `procedural`, `sampling` (fases posteriores).
- BVH e broadphase (F5); estágios de FEM elástico, XPBD paralelo, shape matching, solver rígido XPBD e ponte
  simulação → render (F2/F5), que usarão os módulos e kernels desta spec.
- PBR completo, luzes pontuais e sombras melhores (F4).
