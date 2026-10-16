# Feature Specification: Composição por grafos de nós e contratos de shader estruturados

**Feature Branch**: `feature/031-node-graphs`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "A premissa do motor é poder operar pela composicionalidade: camadas claras e limpas,
extensíveis e amigáveis de programar qualquer coisa de forma rápida e fotorrealista — por isso entidades, Flows e slots.
Como passo extra, composição por grafos de nós, mantendo os dados encapsulados mas flexíveis. Com os nós como base:
cenas composíveis, geometria procedural em árvore como no Blender, os materiais e talvez até a física. O ajuste é
necessário dado que o grafo trará um padrão fundacional; e limpar as dependências de forte acoplamento que estavam
ocorrendo com os WGSL." (Número 031 fora da sequência para não renumerar as specs seguintes; executada antes da F4 —
a 011 passa a construir materiais sobre ela.)

## Contexto e Problema

O motor compõe por **entidades** (Resources com dados tipados por schema), **slots** (o que um estágio consome, resolvido
pela Camada 2) e **Flows** (estágios com estado e transições por evento). Falta o nível de composição que permite montar
comportamento a partir de peças pequenas — o que o Blender faz com nós de shader e de geometria, e o Three.js já tem nos
materiais (TSL). Sem ele, cada capacidade nova vira um struct fixo com interruptores (como o primeiro desenho do material
da 011) ou um shader escrito à mão que conhece o resto do motor.

A 009 deu um passo nessa direção — funções WGSL do usuário em pontos de extensão, compostas pelo núcleo — mas cada ponto
aceita **uma** função de assinatura fixa, sem ramificação, sem reaproveitamento de partes e com parâmetros num registro
genérico de bits.

Ao mesmo tempo, a auditoria do código (2026-10-16, na `develop` após o PR #45) mostra que o contrato entre estágios e
shaders, apesar dos structs gerados (005) e dos layouts inferidos (006), ainda tem o acoplamento do legado:

| Acoplamento                                    | Evidência                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ligação por nome de variável em texto          | O estágio liga `caustic_map`, `water_light_depth`, `shadow_map`, `lights` por string (`ForwardFlow.ts:503-513`, `:779-793`); renomear a variável no WGSL só falha em execução                                                                                                                           |
| `@group/@binding` escolhidos à mão             | A mesma variável global é redeclarada em vários arquivos com índices diferentes: `field_records` em 8, `cameras` em 8, `worlds` em 10, `lights` em 6, `shadow_matrices` em 6; o teste de símbolos não cobre `var` de módulo                                                                             |
| Shader genérico conhecendo outros recursos     | O grupo 3 do `forward.wgsl` mistura quadro, sombra, luzes e cáusticas da água; `water_caustic_factor` (lógica da água) mora no forward; `ForwardFrameParams` tem `causticsEnabled`; sprites e água repetem a mesma família de ligações                                                                  |
| Estágio conhecendo outros estágios             | `ForwardFlow` importa `WaterSurface` (C4), `castingShadowMap` do `ShadowFlow`, schemas da água; `ParticleFlow` pula `SoftBody` com superfície e `FluidSurfaceMaterial`; quatro estágios recriam os mesmos substitutos de sombra e luz                                                                   |
| Índices de grupo fixos no código de desenho    | `ForwardFlow.ts:643-653` assume grupos 0, 1 e 3 iguais entre as famílias forward, pontos e arame; `FluidSurfaceFlow` e `ParticleFlow` tratam `i !== 2` como especial; adaptadores da 009 escolhem `@binding(1)`/`(2)` para caber ao lado de `materials`                                                 |
| Globais do hospedeiro implícitos               | Módulos usam variáveis que só o shader hospedeiro declara (`field_records`, `surface_params`, `cameras`, `forward_frame`, `bake`…); a montagem confere chamadas de função, não variáveis — o erro só aparece no compilador do driver                                                                    |
| Constantes repetidas entre TS e WGSL           | Tamanho de grupo 64 em 80 kernels, na conta de índice de 71 arquivos e em ~10 constantes TS; sentinela `0xFFFFFFFF` com 5 nomes em TS e literal em 21 WGSL; "sem profundidade de água" vale `1e9` em uns e `1e8` em outros; direção de luz padrão em 5 shaders; 16 colisores de superfície em 3 lugares |
| Fonte WGSL remendada por texto                 | `waterSceneSource.replace(...)` com marcador que não é WGSL válido; renomeação por regex do código do usuário; listas posicionais sem tipo (`camera_fn_list: array<vec4u>` empacotada como `(c,t,r,0)`)                                                                                                 |
| Duplicação quase idêntica                      | Corpos iguais em `forward_material_ready`/`material_fn_ready`, `material_check`/`forward_material_fn`; ~60 % comum entre `camera_compose` e `camera_compose_fn`, idem `transform_compose`; teste de valor finito copiado 7 vezes                                                                        |
| Parâmetros de função em registro de bits       | 8 `vec4u` reinterpretados por `bitcast`, teto de 32 escalares; códigos de tipo de campo duplicados entre `field_builtin.wgsl` e `ForceField.ts`                                                                                                                                                         |
| Shaders de apresentação na camada de elementos | Todo o WGSL e os schemas da água e das cáusticas ficam na C3 (`material/shaders.ts`, `forwardSchemas.ts`); a C4 importa schema da C3 para o `WaterSurface`                                                                                                                                              |

Um grafo de nós construído sobre esse contrato herdaria todos esses defeitos e os multiplicaria (cada nó seria mais um
módulo com ligações à mão e globais implícitos). Esta spec cria o padrão de composição por nós **e** estrutura o
contrato de shader para que nós, pontos de extensão e estágios se componham sem se conhecer.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Contratos de shader estruturados, sem acoplamento (Priority: P1)

Quem escreve um estágio, um módulo WGSL ou uma função de extensão declara o que o código usa — dados de pool, texturas,
parâmetros, recursos de cena — e o motor atribui as ligações, confere na montagem que tudo o que o código usa foi
declarado e liga cada recurso pela declaração, não por nome em texto. Um shader de superfície não sabe que a água, a
sombra ou as cáusticas existem: chama um ponto (por exemplo, "luz que chega aqui") cujas contribuições são compostas pela
cena. Adicionar um recurso novo (outro tipo de luz, um efeito de transmissão) não toca o forward nem os outros estágios.

**Why this priority**: é a fundação; sem ela o grafo multiplica o acoplamento. É também dívida que já custa — cada
recurso novo da F4 (luzes, transmissão, céu) incharia o grupo 3 do forward.

**Independent Test**: com o motor migrado, (a) a busca por ligações escritas à mão e por globais implícitos nos módulos
retorna zero; (b) remover o recurso de água da cena não muda nenhum estágio que não seja dela; (c) imagens e trajetórias
das fixtures existentes iguais bit a bit.

**Acceptance Scenarios**:

1. **Given** um módulo que usa um recurso sem declará-lo, **When** o shader é montado, **Then** a montagem falha na
   criação com erro que nomeia o módulo e o recurso — nunca no compilador do driver.
2. **Given** dois módulos que declaram o mesmo recurso compartilhado (ex.: as matrizes de mundo), **When** compostos no
   mesmo shader, **Then** o recurso aparece uma vez, com a ligação atribuída pelo motor.
3. **Given** a cena com água e cáusticas, **When** o forward desenha, **Then** a atenuação de luz pela água chega por um
   ponto composto pela cena; sem água, o ponto pronto devolve luz inalterada e o forward não liga nenhum recurso de água.
4. **Given** um estágio, **When** desenha famílias de pipelines distintas, **Then** nenhum índice de grupo é escrito no
   código do estágio; o motor sabe quais grupos são comuns e quais mudam.
5. **Given** uma constante compartilhada entre TS e WGSL (tamanho de grupo, sentinela, capacidade), **When** usada,
   **Then** vem de uma única definição.

---

### User Story 2 - Grafo de nós de ponto, fundido num único shader (Priority: P1)

Quem programa monta uma regra por amostra — cor, deslocamento, densidade, força, projeção — ligando nós: entradas da
superfície (posição, normal, uv, curvatura, tempo), matemática, ruído, mistura, condições, campos da cena, e nós escritos
pelo próprio usuário em WGSL. O grafo pode ramificar e reaproveitar a saída de um nó em vários lugares. O motor compila o
grafo numa única função dentro do shader que o usa, sem passes intermediários; mudar um valor de parâmetro vale no quadro
seguinte sem recompilar; mudar a ligação dos nós recompila em transição, sem quadro quebrado.

**Why this priority**: é o nível que materiais (011), texturas procedurais (012), campos de força e transformações usam.

**Independent Test**: um grafo de deslocamento e cor com ramificação (uma saída de ruído usada em dois ramos), aplicado a
uma superfície; conferir contra a mesma regra escrita à mão em WGSL (diferença ≤ 1 ULP por canal) e medir que o custo
de GPU é igual ao da versão escrita à mão (± ruído).

**Acceptance Scenarios**:

1. **Given** um grafo com um nó cuja saída alimenta três nós, **When** compilado, **Then** o nó é avaliado uma vez por
   amostra.
2. **Given** ligações com tipos incompatíveis ou um ciclo, **When** o grafo é criado ou alterado, **Then** erro síncrono
   que nomeia os nós e portas.
3. **Given** um parâmetro alterado por quadro, **When** a cena corre, **Then** nenhuma recompilação acontece.
4. **Given** uma ligação alterada, **When** a recompilação termina, **Then** o desenho troca para o novo grafo no
   quadro seguinte; se a compilação falhar, o anterior continua e o motor emite um evento de rejeição.
5. **Given** cada ponto de extensão da 009 (`transform`, `camera`, `surface`, `space`, `field`, `material`, `emit`),
   **When** uma função da 009 é usada, **Then** funciona sem mudança, como um grafo de um nó.

---

### User Story 3 - Grafo de nós de conjunto, compilado num Flow (Priority: P1)

Quem programa monta um processo sobre conjuntos inteiros — gerar uma malha, distribuir pontos sobre ela, instanciar,
subdividir, ordenar, reduzir, avançar partículas — ligando nós cujas arestas são conjuntos de dados (pools, malhas,
partículas). Cada nó de conjunto vira um ou mais passes de compute; as entradas dos nós de conjunto podem receber grafos
de ponto (densidade = ruído × curvatura), fundidos dentro do kernel do nó. O grafo compilado **é** um Flow: suas entradas
e saídas são slots, os buffers intermediários são alocados pela Camada 2, e ele entra no quadro pelos mesmos eventos e
estados de qualquer Flow.

**Why this priority**: é o que habilita geometria procedural em árvore (como os nós de geometria do Blender), VFX e, mais
adiante, física por nós; e é onde o conceito de Flow encontra o grafo.

**Independent Test**: um grafo "grade → deslocar por ruído → recalcular normais → distribuir pontos por densidade →
instanciar esferas" desenhado na cena; conferir contagem, posições e normais contra a referência da CPU, e que nada é lido
de volta por quadro.

**Acceptance Scenarios**:

1. **Given** um grafo de conjunto, **When** inserido na cena, **Then** a Camada 2 aloca os conjuntos intermediários, o
   Flow fica pronto quando os slots estão prontos e despacha os passes na ordem das dependências.
2. **Given** um nó de conjunto com uma entrada de grafo de ponto, **When** compilado, **Then** o grafo de ponto é fundido
   no kernel do nó (nenhum passe extra).
3. **Given** um nó cuja saída tem tamanho decidido na GPU (ex.: distribuição de pontos), **When** o grafo corre, **Then**
   a contagem segue para os nós seguintes e para o desenho sem leitura de volta (despacho e desenho indiretos).
4. **Given** os kernels genéricos existentes (soma de prefixos, ordenação, compactação, redução, coloração), **When**
   usados num grafo, **Then** estão disponíveis como nós de conjunto.
5. **Given** um grafo cujas entradas não mudam, **When** a cena corre, **Then** os passes não são refeitos (o resultado é
   mantido até uma entrada ou parâmetro mudar).

---

### User Story 4 - Grafo como Resource: dado encapsulado, sub-grafos e serialização (Priority: P1)

O grafo é um Resource como qualquer outro: anexado a uma entidade (material, geometria, corpo) ou inserido na cena; os
valores dos parâmetros ficam num registro tipado gerado da forma do grafo e vivem num pool da Camada 2. Um grupo de nós
pode ser empacotado como um nó só (sub-grafo), com parâmetros expostos, e reutilizado em muitos grafos e entidades. O
grafo pode ser salvo e lido como dado (para uma cena composta ou um editor visual futuro).

**Why this priority**: é o que mantém "dados encapsulados, mas flexíveis" e torna cenas composíveis (uma árvore
procedural com o material da casca e o vento como campo, empacotada como um nó).

**Independent Test**: um sub-grafo usado por 1 000 entidades com valores diferentes de parâmetro; conferir uma única
compilação, um pipeline por forma de grafo e valores corretos por entidade; salvar, ler e obter o mesmo resultado bit a
bit.

**Acceptance Scenarios**:

1. **Given** dois grafos com a mesma forma e valores diferentes, **When** usados, **Then** compartilham o shader compilado
   e diferem só no registro de parâmetros.
2. **Given** um sub-grafo com parâmetros expostos, **When** usado em vários grafos, **Then** cada uso tem os seus valores
   e o código é emitido uma vez por shader.
3. **Given** um grafo serializado, **When** lido de volta, **Then** a identidade (hash) e o resultado são os mesmos.
4. **Given** um parâmetro de qualquer tipo suportado, **When** declarado, **Then** o registro é tipado (sem
   reinterpretação de bits) e sem teto fixo de 32 escalares.

---

### User Story 5 - Biblioteca de nós base (Priority: P2)

Nós prontos para o uso comum: entradas por contexto (amostra de superfície, partícula, vértice, célula; tempo; câmera),
matemática escalar e vetorial, mapeamentos (curvas, faixas, rampas de cor), ruídos (valor, gradiente, celular, fBm),
condições e misturas, conversões de espaço, amostragem de campos da cena, geometria diferencial da 010 (métrica,
curvaturas), e os nós de conjunto da US3. Cada nó tem documentação de portas e um teste contra a referência.

**Why this priority**: sem eles o grafo exige WGSL para tudo; com eles, a maioria das regras é montada sem código.

**Independent Test**: cada nó base testado contra referência da CPU em amostras fixas.

**Acceptance Scenarios**:

1. **Given** cada nó base, **When** avaliado em amostras fixas, **Then** o resultado bate com a referência dentro da
   tolerância documentada.
2. **Given** um nó de ruído, **When** avaliado na GPU e na referência, **Then** o padrão é o mesmo (mesma semente, mesma
   saída).

---

### User Story 6 - Arquitetura documentada e migração completa (Priority: P2)

O documento de arquitetura descreve o grafo (nós de ponto, nós de conjunto, compilação, relação com Flows, slots e
pontos de extensão) e o contrato de shader estruturado; todos os estágios e módulos existentes estão migrados; nenhuma
forma antiga fica convivendo.

**Why this priority**: o padrão é fundacional; specs seguintes (011, 012, geometria por nós, física) o tomam como base.

**Independent Test**: revisão do documento contra o código; busca pelos padrões antigos retorna zero.

**Acceptance Scenarios**:

1. **Given** o documento de arquitetura, **When** comparado ao código, **Then** nenhuma divergência.
2. **Given** o repositório, **When** buscados ligações à mão, globais implícitos, remendos de fonte por texto e
   constantes repetidas, **Then** zero ocorrências fora das exceções documentadas.

### Edge Cases

- **Grafo vazio ou sem saída ligada** → usa a implementação pronta do ponto (como a 009); aviso único.
- **Nó WGSL do usuário que declara recurso não suportado pelo contexto** (ex.: textura num nó de conjunto sem slot) →
  erro na criação nomeando o nó.
- **Tipos ligados com conversão implícita** (escalar → vetor) → só conversões declaradas pelo tipo da porta; o resto é
  erro.
- **Grafo de ponto usado em dois contextos** (fragmento e compute) → compilado por contexto; nós que só existem num
  contexto (derivadas de tela) dão erro no outro.
- **Ciclo através de um sub-grafo** → detectado com o caminho completo.
- **Grafo profundo ou largo** → limites do dispositivo (registradores, ligações por grupo) verificados na compilação com
  erro claro; o compilador não excede o número de ligações do adaptador.
- **Valor não finito produzido por um nó** → saneado na saída do grafo (política única, sem cópias por módulo).
- **Troca de topologia a cada quadro** → compilações memorizadas por forma; formas já vistas não recompilam.
- **Física por grafo** → o padrão a suporta, mas a migração dos solvers é da F5; nesta spec os solvers continuam como
  estão, com as ligações estruturadas.
- **Determinismo** → um grafo de conjunto com as mesmas entradas produz o mesmo resultado bit a bit entre execuções e
  entre 30/60/144 Hz quando ligado à simulação.

## Requirements _(mandatory)_

### Functional Requirements

**Contrato de shader estruturado**

- **FR-001**: Todo recurso de GPU usado por um módulo WGSL (pool, buffer, textura, amostrador, parâmetro, recurso de
  cena) MUST ser declarado pelo módulo; o motor MUST atribuir grupo e ligação na montagem. Módulos não escrevem
  `@group/@binding`.
- **FR-002**: A montagem MUST rejeitar, na criação, módulos que usam variáveis globais não declaradas por eles ou por
  suas dependências (hoje só chamadas são conferidas).
- **FR-003**: Recursos compartilhados (matrizes de mundo, câmeras, luzes, registros de campo…) MUST ser declarados uma
  vez, em módulo próprio, e incluídos por dependência; a regra "cada símbolo WGSL definido uma vez" MUST cobrir
  variáveis de módulo.
- **FR-004**: O estágio MUST ligar recursos por declaração tipada; nenhuma ligação por nome de variável em texto e
  nenhum índice de grupo escrito no código do estágio.
- **FR-005**: O motor MUST organizar os grupos por frequência de troca (por quadro, por família de pipeline, por grupo
  de desenho) e saber quais grupos são comuns entre pipelines de um mesmo estágio.
- **FR-006**: Contribuições de recursos de cena ao sombreamento (luzes, sombra, atenuação pela água/cáusticas e, nas
  specs seguintes, céu e transmissão) MUST chegar por pontos compostos pela cena; o forward, os sprites e a água MUST
  NOT conhecer recursos de outros estágios.
- **FR-007**: Estágios MUST NOT importar outros estágios nem recursos de outros estágios (`WaterSurface` no forward,
  `castingShadowMap`, exclusões por tipo no `ParticleFlow`); a escolha do que cada estágio desenha MUST vir das
  declarações das entidades.
- **FR-008**: Constantes compartilhadas entre TS e WGSL (tamanho de grupo, sentinelas, capacidades, códigos de tipo,
  direção padrão) MUST ter uma única definição, exposta aos dois lados pelo motor.
- **FR-009**: Fontes WGSL MUST NOT ser remendadas por substituição de texto; variantes (ex.: profundidade simples ou
  multiamostrada) MUST ser expressas por composição ou constantes de especialização.
- **FR-010**: Listas posicionais sem tipo MUST virar structs gerados de schema.
- **FR-011**: Corpos duplicados entre implementação pronta, adaptador e validação (pontos da 009) e entre kernels
  prontos e com função MUST ser unificados; o saneamento de não finitos MUST ser um módulo único.
- **FR-012**: WGSL e schemas de recursos de apresentação (água, cáusticas) MUST morar na camada do recurso dono; C3 e C4
  importam só a C2.

**Grafo de nós**

- **FR-013**: O motor MUST oferecer nós com portas tipadas (tipos WGSL escalares, vetoriais, matriciais e structs
  gerados), parâmetros declarados por schema e código como módulo WGSL com dependências.
- **FR-014**: Os nós MUST ter dois níveis: **de ponto** (avaliados por amostra, fundidos numa função) e **de conjunto**
  (operam sobre conjuntos inteiros, viram passes de compute).
- **FR-015**: O grafo MUST ser validado na criação e a cada alteração: tipos, portas obrigatórias, ciclos (com caminho),
  contexto de cada nó; erros síncronos nomeando nós e portas.
- **FR-016**: Grafos de ponto MUST ser compilados numa função única por contexto, com cada nó avaliado uma vez por
  amostra mesmo com saída usada em vários lugares, e custo de GPU equivalente ao do mesmo código escrito à mão.
- **FR-017**: Grafos de conjunto MUST ser compilados num Flow: entradas e saídas como slots, conjuntos intermediários
  alocados pela Camada 2, passes na ordem das dependências, estados e transições por evento.
- **FR-018**: Entradas de nós de conjunto MUST aceitar grafos de ponto, fundidos no kernel do nó.
- **FR-019**: Tamanhos decididos na GPU MUST seguir aos nós seguintes e ao desenho por despacho e desenho indiretos, sem
  leitura de volta.
- **FR-020**: Grafos de conjunto MUST manter o resultado enquanto entradas e parâmetros não mudam (nada refeito com a
  cena parada).
- **FR-021**: O grafo MUST ser um Resource: parâmetros num registro tipado gerado da forma do grafo, num pool da Camada
  2; valores novos valem no quadro seguinte sem recompilar; mudança de topologia recompila em transição, troca só
  quando compila e emite evento de rejeição em falha.
- **FR-022**: A identidade de um grafo MUST ser a da sua forma (nós, ligações, código); grafos de mesma forma MUST
  compartilhar compilação e pipeline.
- **FR-023**: Sub-grafos MUST poder ser usados como nós, com parâmetros expostos, código emitido uma vez por shader.
- **FR-024**: O grafo MUST ser serializável e lido de volta com a mesma identidade e o mesmo resultado.
- **FR-025**: Nós escritos pelo usuário em WGSL MUST ser validados como as funções da 009 (assinatura pelas portas,
  símbolos, montagem em cada contexto de uso).
- **FR-026**: Os pontos de extensão da 009 MUST ser servidos pelo grafo: cada função da 009 é um grafo de um nó e
  continua funcionando sem mudança na API pública; os registros de parâmetros passam a ser tipados.
- **FR-027**: Os kernels genéricos existentes MUST estar disponíveis como nós de conjunto.
- **FR-028**: A biblioteca base (US5) MUST estar disponível e testada contra referência.

**Gerais**

- **FR-029**: Imagens e trajetórias das fixtures existentes MUST ficar iguais bit a bit (a spec não muda aparência nem
  física).
- **FR-030**: Nada lido de volta por quadro; bench sem regressão relevante; baseline regravado.
- **FR-031**: Grafo e contrato MUST seguir Resource + evento + Flow, sem helpers; C3 e C4 importam só a C2; o documento
  de arquitetura MUST ser atualizado.

### Key Entities

- **Nó**: unidade de composição — portas de entrada e saída tipadas, parâmetros por schema, código (módulo WGSL), nível
  (ponto ou conjunto), contextos em que pode ser avaliado.
- **Grafo**: Resource com nós e ligações; identidade pela forma; parâmetros no registro tipado gerado; compilado em
  função (ponto) ou Flow (conjunto).
- **Sub-grafo**: grafo empacotado como nó, com parâmetros expostos.
- **Declaração de recurso**: o que um módulo usa (pool, textura, amostrador, parâmetros, recurso de cena), com tipo;
  base da atribuição de ligações.
- **Ponto de cena**: lugar no shader cujas contribuições são compostas pela cena (luz que chega, atenuação, campos);
  generaliza `field`/`space` da 009.
- **Constante compartilhada**: valor único exposto a TS e WGSL.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Zero `@group/@binding` escritos em módulos WGSL do motor; zero ligações por nome em texto nos estágios;
  zero índices de grupo no código de desenho.
- **SC-002**: Zero globais implícitos: todo módulo monta sozinho com as suas declarações (teste por módulo).
- **SC-003**: Zero importações entre estágios; o forward não referencia nenhum recurso de água, sombra ou luz pelo nome
  (os três chegam por pontos de cena).
- **SC-004**: Zero constantes compartilhadas definidas mais de uma vez; zero remendos de fonte por texto.
- **SC-005**: Fixtures de imagem e de trajetória iguais bit a bit antes e depois.
- **SC-006**: Grafo de ponto com ramificação igual à versão escrita à mão (≤ 1 ULP por canal) e com GPU por quadro igual
  (diferença dentro do ruído do bench).
- **SC-007**: Grafo de conjunto da US3 bate com a referência da CPU (contagem exata; posições e normais ≤ 1e-5) e roda
  sem leitura de volta.
- **SC-008**: 1 000 entidades com o mesmo sub-grafo e valores diferentes → 1 compilação, 1 pipeline.
- **SC-009**: Alterar um parâmetro por quadro durante 60 s → zero recompilações; alterar a topologia → troca sem quadro
  quebrado.
- **SC-010**: Grafo serializado e lido de volta → mesma identidade e resultado bit a bit.
- **SC-011**: Todas as funções da 009 e os smokes existentes passam sem mudança, no fonte e com `--dist`.
- **SC-012**: Bench sem regressão relevante em nenhuma cena; montagem do shader com grafo ≤ 10 ms por forma nova.
- **SC-013**: `npm run ci` verde; vídeos (grafo de geometria procedural da US3; grafo de ponto animando cor e
  deslocamento; parâmetro mudando ao vivo).

## Assumptions

- Autoria por código (TypeScript); o grafo serializável deixa o caminho aberto para um editor visual, que não é desta
  spec.
- Materiais por nós (closures BSDF, `layer`, `mix`, OpenPBR como sub-grafo) são da 011; nós procedurais pesados que
  gravam textura em compute (veios, trama, flocos) são da 012; uma biblioteca de nós de geometria (árvores, L-systems,
  distribuição em superfícies) ganha spec própria; a migração dos solvers físicos para nós é da F5. Esta spec entrega o
  padrão, a biblioteca base e o contrato que todas usam.
- O contrato de shader é refeito sem mudar aparência nem física: as fixtures continuam válidas.
- O ponto de cena generaliza o mecanismo dos pontos `field` e `space` da 009 (várias contribuições compostas pela cena,
  troca do pronto em cada pipeline que contém o ponto).
- Constantes de especialização (`override`) do WGSL são o meio preferido para variantes, sem remendo de texto.
