# Feature Specification: Geometria em compute — partículas, fluidos e corpos moles na tela

**Feature Branch**: `feature/008-compute-geometry`

**Created**: 2026-10-13

**Status**: Implementada (2026-10-14) — T001–T057 concluídas, gate verde; MSAA (FR-027) e a otimização da busca de
vizinhos puxados para cá; o arame refeito como no legado (decisão do usuário)

**Input**: User description: "Geometria em compute (spec 008, fase F2 do roadmap — `008-compute-geometry`, fecha a F2
junto com a 007). Implementar no lugar arquitetural certo (C1–C4, `architecture_resource_loaders.md` autoritativo), sem
helpers nem atalhos, todo o item 008 do ROADMAP §5 (linha F2) e a linha "Geometria gerada em compute" de
`specs/PENDENCIAS.md` §4: geometria produzida em compute nos buffers polivalentes; corpos como contêineres de partículas
(`FluidBody`/`SoftBody` com arrays); render de partículas, fluidos e corpos moles (`*_vertex_write` ligados, sprites
instanciados a partir dos pools); `PointCloudGeometry` desenhada; topologia do material respeitada. Critério da F2:
SPH/PBF/MPM/XPBD visíveis, sem leitura de volta por quadro; sem regressão de `bench:check`, baseline regravado ao fim;
imagens existentes idênticas (ou na tolerância do R10 da 007); mesma trajetória a 30/60/144 Hz; build minificado; smokes
com `--dist`; gate completo verde. Fora de escopo: superfície de fluido (F5/017), HDR/PBR e pós (F4), pontos de extensão
(F3), vertex pulling/arena e culling/indirect completos (F7), emissores com spawn/update (F9), demais lacunas da F5.
Branch: feature/008-compute-geometry a partir de develop."

## Contexto e Problema

A 007 pôs o estado de cena na GPU e agrupou os draws por (geometria, pipeline), mas a simulação de partículas continua
invisível. Levantamento no código (`develop` em `10c9be4`):

| Lacuna                              | Estado atual (evidência)                                                                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fluidos e corpos moles não aparecem | SPH, PBF, MPM, XPBD e FEM simulam no pool do corpo (`pool:<Schema>`, só `STORAGE`), mas nenhum estágio de render lê esses pools; o único uso em smoke (`trajectories`) não desenha                                                               |
| Uma entidade por partícula          | `FluidBody` e `SoftBody` são uma partícula cada (`FluidBody.ts:18-20`, `SoftBody.ts:17-19`): um fluido de 65 536 partículas são 65 536 entidades, sem noção de "o corpo" (malha, material, contagem)                                             |
| Kernels de escrita de vértice       | Os `*_vertex_write` (layout de vértice fixo de 8 floats) foram removidos na 005; o modelo alvo do documento de arquitetura é o vertex shader ler o pool pelo índice da instância, sem cópia (`architecture_resource_loaders.md:2387-2392`)       |
| `PointCloudGeometry` inerte         | Declara um buffer `points` que ninguém escreve; inserida com material, entra num grupo de draw e o draw é pulado em silêncio por não ter `vertices` (`ForwardFlow.ts:333-335`, `ShadowFlow.ts:203-205`)                                          |
| Topologia do material ignorada      | `PointSpriteMaterial` declara `point-list` e `WireframeMaterial` `line-list`, mas o forward compila tudo como `triangle-list` com layout de vértice fixo (`ForwardFlow.ts:414-418`, `ShadowFlow.ts:99`); o draw é sempre indexado por triângulos |
| Geometria escrita pela GPU          | Não há caminho "um estágio escreve a geometria, o forward desenha": o forward só desenha buffers `vertices`/`indices` de uma `Geometry` com dados da CPU                                                                                         |

Esta spec fecha a F2: o que a simulação produz na GPU vira imagem na GPU, sem passar pela CPU, e a geometria pode ser
produzida por compute.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Fluido simulado aparece na tela (Priority: P1)

O desenvolvedor insere um fluido (SPH, PBF ou MPM) com um material de partícula e vê as partículas se movendo a cada
quadro, desenhadas como sprites instanciados que leem a posição direto do estado da simulação na GPU.

**Why this priority**: É o critério da F2 ("SPH/PBF/MPM/XPBD visíveis") e a lacuna mais visível: hoje a física de
partículas roda e não há como vê-la.

**Independent Test**: Montar um fluido de 4 096 partículas caindo num recipiente; capturar dois quadros e verificar
pixels de partícula onde a simulação diz que elas estão, mudando entre os quadros; contar leituras GPU→CPU por quadro.

**Acceptance Scenarios**:

1. **Given** um fluido SPH com material de partícula e câmera, **When** a aplicação roda, **Then** cada partícula
   aparece como um sprite do raio do material na posição simulada, e a imagem muda a cada passo da simulação.
2. **Given** o mesmo fluido com PBF ou MPM, **When** a aplicação roda, **Then** o resultado visual segue a mesma regra
   sem código diferente do lado do desenvolvedor.
3. **Given** um fluido de N partículas, **When** um quadro é desenhado, **Then** há um draw para o corpo inteiro (N
   instâncias), nenhuma cópia do estado para um buffer intermediário e nenhuma leitura de volta para a CPU.
4. **Given** um fluido e uma cena com caixas, **When** a cena é desenhada, **Then** partículas e caixas se ocultam
   corretamente pela profundidade.

---

### User Story 2 - Corpo de partículas é uma entidade com arrays (Priority: P1)

O desenvolvedor cria um fluido ou corpo mole como um único objeto com as posições (e velocidades, massas etc.) em
arrays, em vez de uma entidade por partícula; o corpo tem um material, uma contagem e pode ser removido inteiro.

**Why this priority**: É pré-requisito de desenhar "o corpo" (um draw, um material, uma malha) e corta a sobrecarga de
uma entidade por partícula. Está explícito na linha F2 do ROADMAP.

**Independent Test**: Criar um fluido de 10 000 partículas como um corpo; verificar que ocupa uma faixa contígua do pool
do algoritmo, que o World tem uma entidade para ele, que a trajetória é a mesma da montagem antiga com as mesmas
partículas e que removê-lo libera a faixa inteira.

**Acceptance Scenarios**:

1. **Given** um corpo com arrays de N partículas, **When** é inserido, **Then** ocupa N slots contíguos do pool do seu
   algoritmo e os estágios de física o simulam como antes.
2. **Given** a mesma disposição de partículas montada como corpo, **When** a simulação roda 240 passos a 30, 60 e
   144 Hz, **Then** a trajetória é idêntica à de referência (fixture das sete cenas de física).
3. **Given** um corpo inserido, **When** é removido, **Then** os N slots são liberados e outro corpo pode ocupá-los.
4. **Given** um corpo de uma partícula, **When** é inserido, **Then** funciona como o caso geral (N = 1).
5. **Given** arrays com tamanhos inconsistentes (posições com N, massas com M ≠ N), **When** o corpo é criado, **Then** o
   erro nomeia o campo e os tamanhos.

---

### User Story 3 - Corpo mole desenhado como malha deformável (Priority: P1)

O desenvolvedor cria um corpo mole (XPBD ou FEM) com partículas e triângulos de superfície e vê a malha se deformar com
a simulação, com normais calculadas na GPU a cada quadro e iluminação correta.

**Why this priority**: Completa "render de corpos moles" e é o primeiro caso de geometria produzida em compute (normais
por vértice recalculadas a partir das posições simuladas).

**Independent Test**: Um tecido XPBD preso por dois cantos caindo sob gravidade; capturar quadros e verificar a malha
iluminada que muda de forma; verificar que vértices e normais vêm de kernel, sem escrita da CPU por quadro.

**Acceptance Scenarios**:

1. **Given** um corpo mole com triângulos de superfície e um material padrão, **When** a aplicação roda, **Then** a
   malha é desenhada com as posições simuladas e normais recalculadas no mesmo quadro.
2. **Given** um corpo mole sem triângulos (só partículas), **When** é desenhado com material de partícula, **Then**
   aparece como sprites, como um fluido.
3. **Given** um corpo mole e uma luz que projeta sombra, **When** a cena é desenhada, **Then** a malha deformada projeta
   e recebe sombra.

---

### User Story 4 - Geometria produzida por um estágio de compute (Priority: P2)

O desenvolvedor (ou um estágio do motor) escreve vértices e índices de uma geometria na GPU — por exemplo uma
`PointCloudGeometry` preenchida por um kernel — e o forward a desenha sem que a CPU toque nos dados.

**Why this priority**: É o mecanismo geral ("geometria produzida em compute nos buffers polivalentes") sobre o qual as
US1 e US3 se apoiam e que as fases F3, F8 e F9 vão usar.

**Independent Test**: Um estágio de teste escreve uma espiral de 10 000 pontos numa `PointCloudGeometry` a cada quadro;
verificar a imagem e que a geometria não foi enviada pela CPU.

**Acceptance Scenarios**:

1. **Given** uma `PointCloudGeometry` com material de partícula e um estágio que escreve os pontos, **When** a
   aplicação roda, **Then** os pontos aparecem com a contagem declarada.
2. **Given** uma geometria cujos buffers são escritos só pela GPU, **When** é inserida, **Then** a CPU não envia os
   dados e a geometria não é deduplicada com outra.
3. **Given** uma geometria produzida pela GPU sem índices, **When** é desenhada, **Then** o draw não indexado usa a
   contagem de vértices declarada.
4. **Given** um estágio que escreve uma geometria e o forward que a lê, **When** os dois rodam no mesmo quadro, **Then**
   a escrita termina antes da leitura (ordem por fase e dependência declarada).

---

### User Story 5 - Topologia do material respeitada (Priority: P2)

O material decide como a geometria é desenhada: `WireframeMaterial` desenha arestas, `PointSpriteMaterial` desenha
sprites nos vértices e `StandardMaterial` desenha triângulos.

**Why this priority**: Corrige um comportamento errado registrado no ROADMAP (topologia ignorada) e é o que dá sentido
aos materiais de partícula das US1–US4.

**Independent Test**: Uma caixa com cada material; verificar arestas, sprites e faces na imagem; contar grupos de draw.

**Acceptance Scenarios**:

1. **Given** uma caixa com `WireframeMaterial`, **When** é desenhada, **Then** aparecem as arestas dos triângulos, sem
   faces preenchidas.
2. **Given** uma caixa com `PointSpriteMaterial`, **When** é desenhada, **Then** aparece um sprite do raio do material
   em cada vértice.
3. **Given** a mesma geometria com dois materiais de topologia diferente, **When** desenhada, **Then** cada combinação
   forma o seu grupo de draw.
4. **Given** um material de topologia de linhas ou pontos, **When** a sombra é desenhada, **Then** a regra de sombra do
   material é aplicada (linhas e sprites não projetam sombra, salvo opção do material).

---

### Edge Cases

- Corpo com zero partículas: rejeitado na criação com mensagem que nomeia o corpo.
- Corpo que não cabe no teto de partículas do algoritmo (E4, 65 536): erro na inserção que nomeia o teto e o pedido; o
  teto em si continua na F5.
- Inserir e remover corpos com contagens diferentes repetidamente: a faixa liberada é reutilizada ou o pool cresce por
  dobra, sem vazamento e sem mover corpos vivos de modo visível na trajetória.
- Partícula com posição não finita (explosão numérica): o sprite não é desenhado e não contamina outros pixels.
- Corpo mole com triângulos que referenciam partículas inexistentes: erro na criação com o índice inválido.
- Geometria produzida pela GPU cuja contagem muda (pontos ativos variáveis): o draw usa a contagem atual declarada pelo
  estágio, sem leitura de volta.
- Mistura de corpos de partículas e geometrias comuns com o mesmo material: grupos distintos, cada um com o seu draw.
- Material de partícula aplicado a uma geometria com índices de triângulos: sprites nos vértices (US5).
- Remover o estágio de física de um corpo em cena: o corpo continua desenhado na última posição.

## Requirements _(mandatory)_

### Functional Requirements

**Corpos como contêineres de partículas**

- **FR-001**: `FluidBody` e `SoftBody` MUST aceitar arrays de partículas (posição obrigatória; velocidade, massa e demais
  campos do schema do algoritmo opcionais com os padrões de hoje) e representar o corpo inteiro como uma entidade.
- **FR-002**: Um corpo de N partículas MUST ocupar N slots contíguos do pool do seu algoritmo, com o mesmo layout de
  hoje; a ordem das partículas no pool MUST ser a ordem dos arrays.
- **FR-003**: Os estágios de física MUST simular corpos-contêiner sem mudança de resultado: mesma trajetória das sete
  cenas de física a 30, 60 e 144 Hz (bit a bit, ou na tolerância registrada).
- **FR-004**: Remover um corpo MUST liberar a faixa inteira; o pool MUST reutilizar faixas livres ou crescer por dobra
  sem alterar a simulação dos corpos vivos.
- **FR-005**: `SoftBody` MUST aceitar triângulos de superfície opcionais (índices de partícula) validados na criação.
- **FR-006**: A montagem antiga (uma entidade por partícula) MUST ser removida da API pública, com o equivalente no guia
  de migração.

**Render de partículas e corpos moles**

- **FR-007**: Um corpo de partículas com material de partícula MUST ser desenhado com um draw instanciado por corpo,
  cujo vertex shader lê a posição direto do pool do corpo pelo índice da instância, sem cópia intermediária.
- **FR-008**: O caminho de FR-007 MUST servir a todos os algoritmos de partícula (SPH, PBF, MPM fluido, MPM sólido,
  XPBD, FEM) sem código específico por algoritmo no desenvolvedor; o estágio de render descobre o campo de posição pelo
  schema do corpo.
- **FR-009**: Um `SoftBody` com triângulos e material de superfície MUST ser desenhado como malha cujas posições vêm do
  pool e cujas normais são recalculadas por kernel a cada quadro, antes do forward e da sombra.
- **FR-010**: Corpos de partículas MUST participar do teste de profundidade com o resto da cena e, quando o material
  permitir, da sombra.
- **FR-011**: Nenhum quadro MUST ler de volta para a CPU posições de partícula ou de vértice (contado em teste); a
  leitura sob demanda existente (`resources.read`) continua disponível.

**Geometria produzida em compute**

- **FR-012**: Uma `Geometry` MUST poder declarar buffers de vértice/índice escritos só pela GPU (sem envio da CPU),
  com contagem declarada e uso polivalente (escrita em compute, leitura como vértice/índice ou como storage no vertex
  shader).
- **FR-013**: A posse da escrita de uma geometria produzida pela GPU MUST ser declarada pelo estágio que a escreve
  (como a posse por conjunto da 007), e a ordem escrita → desenho MUST vir das fases e dependências dos estágios.
- **FR-014**: `PointCloudGeometry` MUST ser desenhada quando tiver material e um escritor; sem escritor, MUST ser
  desenhada com o conteúdo inicial e o aviso de geometria sem escritor MUST aparecer uma vez.
- **FR-015**: O forward e a sombra MUST desenhar geometria sem índices com draw não indexado e a contagem declarada.
- **FR-016**: Geometria produzida pela GPU MUST ficar fora da deduplicação por conteúdo.

**Topologia do material**

- **FR-017**: O pipeline de cada grupo de draw MUST usar a topologia declarada pelo material (triângulos, linhas,
  pontos).
- **FR-018**: `WireframeMaterial` sobre geometria de triângulos MUST desenhar as arestas, com os índices de aresta
  produzidos por kernel a partir dos índices de triângulo (uma vez por geometria, refeito se os índices mudarem).
- **FR-019**: `PointSpriteMaterial` MUST desenhar um sprite instanciado (quad virado para a câmera) por vértice ou
  partícula, com o raio do material.
- **FR-020**: A chave de grupo de draw MUST incluir a topologia, e a sombra MUST seguir a regra de sombra do material.

**Preservação e verificação**

- **FR-027**: (Puxado da F4/011 por decisão do usuário, 2026-10-13.) A geometria MUST ser desenhada com antialiasing por
  MSAA (4 amostras por pixel nos alvos da cena, resolvidas na cor lida pelo pós), ligado por padrão e desligável pela
  aplicação; forward, arame, sprites e malhas de corpo mole usam as mesmas amostras.
- **FR-021**: As imagens das cenas de render existentes MUST continuar idênticas, exceto onde a topologia correta muda
  o desenho (a caixa com `WireframeMaterial` da cena `forward`); essas fixtures MUST ser regravadas com a diferença
  descrita e aprovada no PR.
- **FR-022**: MUST existir smoke com imagem de referência para fluido (SPH, PBF, MPM), corpo mole (XPBD com malha, FEM)
  e nuvem de pontos produzida em compute, verificando posição e movimento.
- **FR-023**: MUST existir cena de benchmark de partículas (fluido) com o clayflow medindo CPU e GPU por quadro; o Three
  entra com o mesmo número de sprites instanciados atualizados pela CPU, como referência de custo de desenho.
- **FR-024**: `bench:check` MUST passar sem regressão contra o baseline vigente, e o baseline MUST ser regravado ao fim.
- **FR-025**: Nenhum struct MUST ser duplicado entre TypeScript e WGSL; o build minificado MUST funcionar; fronteira
  D4 mantida.
- **FR-026**: O documento de arquitetura, o guia de migração, o ROADMAP (inclusive as referências de linha
  desatualizadas da seção de diagnóstico) e o PENDENCIAS (P10 descrito com precisão, linha "Geometria gerada em compute"
  resolvida) MUST descrever o estado novo.

### Key Entities

- **Corpo de partículas**: entidade única com N partículas em arrays (posição e campos do schema do algoritmo), uma
  faixa contígua no pool do algoritmo, um material e, para corpos moles, triângulos de superfície opcionais.
- **Faixa de pool**: intervalo contíguo de slots alocado de uma vez para um corpo e liberado inteiro.
- **Geometria produzida pela GPU**: geometria cujos buffers são escritos por um estágio, com contagem declarada, posse
  do escritor e sem envio da CPU.
- **Topologia do material**: triângulos, linhas ou pontos; parte da chave do grupo de draw.
- **Grupo de draw de corpo**: um draw instanciado por corpo de partículas (instâncias = partículas do corpo).

## Success Criteria _(mandatory)_

Medidos na máquina de referência livre, no protocolo do benchmark.

### Measurable Outcomes

- **SC-001**: SPH, PBF, MPM (fluido e sólido), XPBD e FEM visíveis: cada smoke de imagem mostra as partículas ou a malha
  na posição simulada (comparação com a referência dentro da tolerância declarada) e a imagem muda entre quadros.
- **SC-002**: 0 leituras GPU→CPU por quadro de posição de partícula ou vértice em todas as cenas de partículas (contado
  em teste).
- **SC-003**: Um corpo de N partículas desenhado com 1 draw (contado em teste com N = 10 000 e 3 corpos = 3 draws).
- **SC-004**: CPU por quadro da cena de fluido do benchmark constante no número de partículas: a de 65 536 no máximo
  1,5× a de 4 096.
- **SC-005**: Fluido de 65 536 partículas (teto atual) a pelo menos 60 fps de intervalo de quadro com simulação e
  render, em 1280×720.
- **SC-006**: Trajetórias das sete cenas de física idênticas a 30, 60 e 144 Hz com os corpos montados como contêineres.
- **SC-007**: Topologia: a caixa de arame mostra só arestas (0 pixels de face preenchida no interior, verificado na
  fixture) e a de sprites mostra 8 sprites.
- **SC-008**: Imagens das cenas de render existentes idênticas, exceto as regravadas pela FR-021 com a diferença
  descrita.
- **SC-009**: `bench:check` sem regressão > 10% contra o baseline vigente; baseline regravado ao fim.
- **SC-010**: Gate completo verde (format, lint, tsc, `test:coverage`, `build:lib`, `doc:coverage`); todos os smokes
  passam no código-fonte e com `--dist`.

## Assumptions

- O desenho de partículas é por sprites instanciados com o vertex shader lendo o pool; vertex pulling geral de
  geometria e arena de geometria continuam na F7 (R4 da 007).
- Os kernels `*_vertex_write` removidos na 005 não voltam: "ligar os `*_vertex_write`" do ROADMAP é atendido pela leitura
  direta do pool (sprites) e pelo kernel de normais da malha de corpo mole.
- O teto de 65 536 partículas por algoritmo (E4) continua; o SC-005 mede no teto.
- A superfície de fluido (malha ou screen-space) é da F5/017; aqui o fluido é desenhado como partículas.
- Emissores de partículas (`ComputeParticleEmitter`, `ScriptedParticleEmitter`) continuam sem simulação nem render
  (P6, F9/025); só a `PointCloudGeometry` é ligada aqui.
- A regra de sombra padrão: triângulos projetam; linhas e sprites não projetam, salvo opção do material.
- `RigidBody` continua uma entidade por corpo (a pose vai ao `Transform`, como na 007); contêiner de corpos rígidos não
  faz parte do pedido.
- O Three no benchmark de partículas é referência de custo de desenho (não tem SPH); a comparação de simulação não se
  aplica.
- Sem camada de compatibilidade para a montagem de uma entidade por partícula; o guia de migração registra o
  equivalente.

## Out of Scope

- Superfície de fluido, tensão superficial e acoplamento fluido-sólido (F5/017, P7, P10).
- HDR, PBR, pós-processamento e luzes novas (F4); o MSAA foi trazido para cá (FR-027).
- Pontos de extensão matemáticos com funções do usuário (F3).
- Vertex pulling geral, arena de geometria, culling e draws indiretos GPU-driven (F7).
- Emissores com spawn/update em compute (F9).
- Aumento do teto de partículas (E4) e demais lacunas da F5.
- Débitos G1–G3, nas fases indicadas no PENDENCIAS.
