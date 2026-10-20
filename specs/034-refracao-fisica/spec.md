# Feature Specification: Refração física e qualidade de imagem (a 034 refeita)

**Feature Branch**: `feature/034-refracao-fisica`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Refração física e qualidade de imagem — a 034 refeita. Substitui as duas tentativas
anteriores (`feature/034-ray-refraction-debts` no Mac e `fix/034-correcoes-validacao` na RTX 4090): nenhum código delas
é reutilizado; entram só as lições e os levantamentos como requisitos. Escopo: (1) refração traçada como Flow próprio,
fora da iluminação global, dentro dos limites do Apple M4, com pilha de meios, GGX, Fresnel exato, reflexo traçado,
dispersão por canal em cada interface, saída da água com reflexão interna total, sem cópia da tela nem imagem pronta;
(2) antisserrilhado global (amostras deslocadas no pixel em todos os passes, vetores de movimento, histórico com
rejeição, filtros na origem); (3) manchas da luz global e da névoa, medidas e corrigidas no motor; (4) falhas herdadas
do develop (H1, H4, H5 e as seis checagens desde a 011); (5) lições das regressões da 4090; (6) gravação de vídeo direto
da GPU. Políticas: Resource + evento + Flow, sem helpers; C3/C4 só pela C2; WGSL definido uma vez; física bit a bit;
água e vidro só por física e raio traçado; limiares por exatidão contra referência e tempo como fração do quadro de
60 Hz com o M4 como piso." (texto integral na mensagem da sessão de 2026-10-20)

## Contexto e Problema

A 034 teve duas tentativas, ambas descartadas pelo usuário:

| Tentativa                                | O que deu errado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature/034-ray-refraction-debts` (Mac) | Atalhos no lugar da física (cópia da tela, desfoque de tela, ambiente no lugar do raio, um acerto para os três canais) e critérios de smoke reescritos para passar                                                                                                                                                                                                                                                                                                                                  |
| `fix/034-correcoes-validacao` (RTX 4090) | Refração dentro do `ProbeFlow` usando 11–13 storage buffers (o M4 permite 10): toda cena com GI ou água deixou de abrir no Mac; sem pilha de meios; média temporal de 64 quadros sem rejeição (rastro e borrão em movimento); parede fina pela cópia da tela; física da água alterada (`37b8d6f`); sombra PCSS sem fixtures do Mac; regressões no bench do Mac (`instances/100k` 0,68 → 1,82 ms, `10k-functions` 0,30 → 0,79 ms, GI desligada 1,65 → 2,40 ms); relógio desfeito durante compilações |

Os levantamentos das duas (análise da 4090 §2–§9, `causes.md` da tentativa do Mac) continuam valendo como requisitos.

Medida nova (Mac M4, `develop` em `3a5ad83`, 2026-10-20): o alvo HDR lido direto da GPU, câmera parada, luz indireta
contra o traçador de caminhos da CPU, erro relativo ao nível de cada face, separado em parte lenta (média em janela de
13 px dentro da face, após tirar o viés da face) e rápida; média de 32 quadros seguidos:

| Cena / qualidade            | Viés por face (pior) | Manchas (erro lento na face) | Cintilação por pixel |
| --------------------------- | -------------------- | ---------------------------- | -------------------- |
| Cornell, `high`, 1 cascata  | 9,6 %                | 9,3 %                        | 1,2 %                |
| Cornell, `medium`           | 19,8 %               | 20,1 %                       | 2,8 %                |
| Cômodo com janela, `high`   | 8,5 %                | 1,9 %                        | 0,5 %                |
| Cômodo com janela, `medium` | 9,6 %                | 3,6 %                        | 1,3 %                |

As manchas persistem na média de 32 quadros: são erro de cálculo, não ruído nem compressão. JPEG 0,92 sobre os 8 bits
acrescenta em média 0,3 nível de código (pior 10–11 em bordas) e o H.264 CRF 18 fica acima de 50 dB de PSNR num quadro
parado — a codificação não explica as manchas. A névoa do feixe parada fica a 0,4 % da referência; numa rodada em que
os quadros foram lidos antes de os pipelines da névoa ficarem prontos, saiu 16 % abaixo — falta prontidão confiável.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Vidro e água refratam pela física (Priority: P1)

Quem monta uma cena com vidro (esfera, bloco, lente, vidro colorido, vidro áspero, prisma) ou água vê através deles o
que a física dá: o raio refrata em cada interface pela lei de Snell com Fresnel exato, segue até a superfície de trás e
recalcula a luz dela, atravessa meios encaixados (vidro dentro d'água, água num copo), absorve pelo caminho percorrido,
reflete internamente quando o ângulo passa do crítico, espalha pela rugosidade e separa as cores pela dispersão. Nítido
em qualquer ampliação, igual com a iluminação global ligada ou desligada, em qualquer GPU com WebGPU.

**Why this priority**: é o débito R1 da 011 e o motivo das duas 034 descartadas; vidro e água são o caso mais visível
de "AAA ou truque".

**Independent Test**: smoke `refraction` com seis cenas comparadas ao traçador de caminhos da CPU (com pilha de meios),
a lente de 4× sobre xadrez e a contagem de leituras da cópia da tela.

**Acceptance Scenarios**:

1. **Given** uma esfera de vidro IOR 1,5 sobre um xadrez ampliando 4×, **When** o quadro converge, **Then** a borda do
   xadrez visto pela esfera não tem degrau de pixel e a média por região fica a ≤ 3 % da referência.
2. **Given** uma esfera de vidro meio mergulhada num tanque de água, **When** o raio passa ar → água → vidro → água →
   ar, **Then** cada interface usa o par de índices certo (pilha de meios) e a imagem fica a ≤ 3 % da referência.
3. **Given** um bloco de vidro com rugosidade 0,3, **When** o quadro converge, **Then** o espalhamento sai de raios
   amostrados pela distribuição da microfaceta (sem desfoque de tela) e fica a ≤ 5 % da referência.
4. **Given** um prisma de Abbe 20, **When** a luz atravessa duas interfaces, **Then** cada canal segue seu próprio
   caminho em todas as interfaces e é iluminado no próprio acerto.
5. **Given** a câmera dentro d'água olhando para cima além do ângulo crítico, **When** o raio sai do volume, **Then**
   há reflexão interna total e, abaixo do ângulo, refração com a normal da saída, Fresnel e a ondulação da superfície.
6. **Given** a iluminação global desligada ou ausente, **When** a cena tem vidro, **Then** a refração continua traçada
   (só a luz que chega às superfícies de trás muda).
7. **Given** um vidro fino (parede de espessura zero), **When** a câmera olha através dele, **Then** o que se vê vem do
   raio traçado, nunca da cópia da tela.

---

### User Story 2 - Imagem sem serrilhado, parada e em movimento (Priority: P1)

Quem roda uma cena vê bordas, sombras, brilhos especulares, padrões procedurais, a borda do vidro e o que se vê através
dele sem serrilhado nem cintilação, e, quando a câmera ou um objeto se move, sem rastro nem borrão.

**Why this priority**: o serrilhado aparece em todos os vídeos; a refração precisa do mesmo histórico com rejeição, e
fazer os dois separados duplicaria a infraestrutura (decisão do usuário: entra na 034).

**Independent Test**: smoke `antialiasing` comparando com uma referência supersamplada (64 amostras por pixel) da mesma
cena, parada e com câmera e objeto em movimento.

**Acceptance Scenarios**:

1. **Given** uma cena parada com arestas, xadrez procedural, especular fino, sombra e vidro, **When** 16 quadros
   passam, **Then** o erro contra a referência supersamplada fica no limite de SC-004.
2. **Given** uma bola que passa atrás de um vidro, **When** ela sai do ponto, **Then** em ≤ 4 quadros não sobra rastro
   dela naquele pixel (SC-005).
3. **Given** a câmera girando em volta de um vidro, **When** a imagem atrás do vidro muda, **Then** o histórico antigo é
   rejeitado e a imagem não borra além do limite de SC-005.
4. **Given** um padrão procedural visto em ângulo rasante, **When** ele fica menor que o pixel, **Then** ele se filtra
   (sem moiré) já na origem, sem depender só do acúmulo.

---

### User Story 3 - Luz global e névoa sem manchas (Priority: P1)

Quem roda as cenas com iluminação global (Cornell, cômodo com janela, sala) e névoa vê paredes lisas, sem manchas
coloridas de vários ladrilhos, sem escurecimento falso nas quinas e sem padrão em blocos na névoa.

**Why this priority**: as manchas estão em todos os vídeos de GI e são erro de cálculo medido (tabela do Contexto).

**Independent Test**: smoke `giNoise` com as medidas da tabela do Contexto (viés por face, manchas, cintilação) nas
qualidades `medium` e `high`, e a névoa com câmera em movimento.

**Acceptance Scenarios**:

1. **Given** o cômodo com janela e a Cornell em `medium` e `high`, **When** 2 s passam com a câmera parada, **Then**
   viés por face, manchas e cintilação ficam nos limites de SC-006.
2. **Given** um receptor de cáusticas em qualquer altura e inclinação, **When** a luz passa pelo vidro, **Then** o fluxo
   da cáustica conserva a energia (SC-007).
3. **Given** névoa e câmera andando, **When** a imagem é medida, **Then** não há padrão em blocos dos froxels nem
   cintilação acima de SC-006.
4. **Given** a borda da mancha de sol no chão, **When** vista a 1280×720, **Then** não há degrau visível.

---

### User Story 4 - O motor diz quando está pronto (Priority: P1)

Quem escreve uma aplicação, um smoke, o bench ou a gravação de vídeo espera um evento de prontidão do motor (nenhuma
compilação ou verificação em voo, nenhum Flow preparando) antes de medir ou gravar, com prazo, e a simulação nunca
depende da velocidade da máquina para compilar.

**Why this priority**: a névoa saiu 16 % errada quando lida cedo; a tentativa da 4090 desfazia o relógio, e a semente do
ruído passou a depender da velocidade de compilação; vários smokes medem antes de ficar pronto.

**Independent Test**: smoke que insere névoa, GI, vidro e um colisor obrigatório no meio da execução e confere que a
medida depois da prontidão é igual à de uma execução sem pressa, e que o prazo dispara um erro claro.

**Acceptance Scenarios**:

1. **Given** um recurso novo inserido com a cena rodando, **When** os pipelines dele compilam, **Then** o motor publica
   o estado "preparando" e depois "pronto"; quem esperou a prontidão mede a cena completa.
2. **Given** uma compilação que não termina no prazo, **When** o prazo vence, **Then** o motor emite um erro com o nome
   do pipeline, sem travar a página.
3. **Given** a mesma cena em duas máquinas de velocidades diferentes, **When** o mesmo número de passos roda, **Then** a
   trajetória física e a sequência de amostras são idênticas bit a bit.

---

### User Story 5 - Medidas e smokes herdados confiáveis (Priority: P2)

Quem mede tempo de GPU no Apple tem uma leitura por quadro, sem repetição, e os smokes herdados (H4, H5, as seis
checagens desde a 011) passam porque o motor foi corrigido, não porque o critério mudou.

**Why this priority**: sem medida certa não há orçamento; os smokes vermelhos escondem regressões novas.

**Independent Test**: smokes de desempenho com ≥ 90 amostras distintas; as seis checagens com o critério original.

**Acceptance Scenarios**:

1. **Given** o profiler no Apple M4, **When** 160 quadros rodam, **Then** cada quadro entrega uma leitura própria e o
   smoke tem ≥ 90 leituras distintas.
2. **Given** as seis checagens que quebraram em `5ef1dd4`, **When** a causa no motor é corrigida (AgX conferido contra a
   curva de referência, exposição padrão, níveis das luzes e do hemisfério, especular dos materiais de teste), **Then**
   passam com o critério original; se o motor se provar certo e o critério errado, a medida vai ao usuário, que decide.

---

### User Story 6 - Vídeos fiéis ao motor (Priority: P2)

Quem grava um vídeo de uma cena recebe a imagem que o motor produziu, lida direto da GPU, quadro a quadro com passo
fixo, codificada em alta qualidade num formato que abre no celular, começando só depois da prontidão.

**Why this priority**: os vídeos são a validação visual do usuário; o caminho atual (canvas 2D → JPEG → H.264) perde
qualidade e às vezes devolve quadro vazio.

**Independent Test**: gravar uma cena conhecida e comparar cada quadro do vídeo decodificado com a imagem lida da GPU.

**Acceptance Scenarios**:

1. **Given** uma cena de GI ou névoa, **When** o vídeo é gravado, **Then** cada quadro decodificado fica acima de SC-010
   contra o quadro lido da GPU.
2. **Given** a gravação de qualquer cena, **When** ela termina ou falha, **Then** nenhum processo de navegador ou
   codificador fica órfão e cada processo externo tem prazo.

---

### User Story 7 - Sem regressão e em qualquer GPU (Priority: P2)

Quem atualiza o motor não perde física, desempenho nem compatibilidade: as trajetórias seguem bit a bit, o bench do Mac
não regride, nada depende de Mac ou NVIDIA, e as melhorias de desempenho das tentativas anteriores só entram com prova
de equivalência.

**Why this priority**: a tentativa da 4090 mudou a física da água, quebrou o Mac e regrediu o bench sem perceber.

**Independent Test**: suíte inteira de smokes (fonte e `--dist`) no M4 e na 4090, `bench:check` contra o baseline do
Mac, teste bit a bit da vizinhança das partículas contra o develop.

**Acceptance Scenarios**:

1. **Given** a vizinhança das partículas reordenada por célula, **When** comparada ao develop no mesmo estado, **Then**
   a lista de vizinhos de cada partícula e a trajetória são idênticas, inclusive para partículas fora da grade.
2. **Given** a sombra direcional com penumbra da fonte, **When** a câmera anda, **Then** não há acne nem vazamento e a
   caixa da sombra cobre o que a câmera vê (não a cena inteira).
3. **Given** qualquer recurso da 034, **When** verificado contra os limites WebGPU padrão, **Then** cabe neles sem
   depender de limite maior de uma GPU específica.

---

### User Story 8 - Pendências da fase fechadas (Priority: P2)

Quem consulta o `PENDENCIAS.md` e os `tasks.md` encontra as pendências desta fase fechadas no motor, com medida, e as
demais com estado conferido no código e destino registrado; nenhuma caixa aberta sem dono.

**Why this priority**: a 034 nasceu também para as pendências da fase (decisão do usuário, 2026-10-20); as 011 US5 e
US6 vão para a 035.

**Independent Test**: varredura das caixas `- [ ]` das specs 001–033 e dos itens abertos do `PENDENCIAS.md`, cada um
com estado e destino; smokes e bench das pendências fechadas.

**Acceptance Scenarios**:

1. **Given** a medida de GPU corrigida (US5), **When** `particles/64k-water` e `rigid-bodies/10k` rodam, **Then** H3 e
   G3 ficam com número medido e dentro do orçamento, ou com a causa medida e corrigida.
2. **Given** um material que lê derivadas de tela, **When** ele é visto por um raio (vidro, reflexo), **Then** a
   textura é filtrada pela abertura do raio (H6), sem serrilhar.
3. **Given** uma cena sem efeitos de pós, **When** o quadro termina, **Then** não há passe de cópia só para a tela
   (G2).
4. **Given** a água da 017/011, **When** vista pela câmera, **Then** a composição dela vem do traçado da US1 (sem a cópia
   própria da tela), com Fresnel exato, rugosidade GGX e cáusticas físicas (011 US4).
5. **Given** as tarefas já feitas e não marcadas (005 T084, 006 T078, 011 T025/T083/T103/T111), **When** conferidas no
   código, **Then** são marcadas com a evidência.

---

### Edge Cases

- Raio que atravessa mais interfaces que o limite: termina com a energia contabilizada (absorvida ou pelo último meio),
  nunca preto silencioso; o limite é registrado e medido.
- Interfaces coincidentes (vidro encostado na água): a pilha de meios não duplica nem perde meio.
- Câmera nascendo dentro de um meio (submersa): o meio inicial vem da posição da câmera.
- Dispersão com rugosidade: cada canal amostra a própria microfaceta.
- Objeto que aparece de repente (desoclusão): o histórico daquele pixel é rejeitado; o pixel converge de novo sem
  mancha.
- Corte de câmera (teletransporte): todo o histórico é descartado no quadro do corte.
- Redimensionar a tela: histórico e alvos se refazem sem leitura do conteúdo antigo.
- GI ausente: refração e antisserrilhado continuam; recursos que só a GI usa não ficam alocados.
- Dispositivo que não aceita um recurso opcional: o motor emite evento de não suportado e segue sem ele, sem quebrar a
  cena.
- Compilação que falha: erro com o nome do pipeline; o resto da cena segue.

## Requirements _(mandatory)_

### Functional Requirements

**Refração (US1)**

- **FR-001**: A refração MUST seguir o raio pela estrutura de raios da 033 através de todas as interfaces
  transmissivas até uma superfície opaca, o céu ou o limite de interfaces, e recalcular o material e a luz no acerto.
- **FR-002**: A refração MUST ser um Flow próprio, que consome a estrutura de raios e a luz da cena por contrato da C2,
  sem depender de a iluminação global estar presente ou ligada.
- **FR-003**: Cada interface MUST usar o par de índices dado por uma pilha de meios (entrar empilha, sair desempilha),
  com o meio inicial da posição da câmera.
- **FR-004**: Fresnel MUST ser o dielétrico exato; acima do ângulo crítico, reflexão interna total.
- **FR-005**: A rugosidade da transmissão e da reflexão MUST vir de raios amostrados pela distribuição visível de
  normais (GGX), com o peso correto.
- **FR-006**: O reflexo nas faces atravessadas MUST ser um raio refletido traçado, com Fresnel.
- **FR-007**: Na dispersão, cada canal MUST seguir e ser iluminado no próprio caminho, com o índice do canal decidido em
  cada interface.
- **FR-008**: A absorção MUST seguir Beer–Lambert pelo comprimento percorrido em cada meio.
- **FR-009**: A água MUST refratar na entrada e na saída com a normal da superfície simulada, incluindo ondulação e
  rugosidade.
- **FR-010**: Nenhum caminho da refração (inclusive a parede fina e o limite de interfaces) MUST ler a cópia da tela,
  textura ou imagem pronta no lugar do resultado físico.
- **FR-011**: A referência da CPU MUST implementar a pilha de meios de forma independente da GPU, para que um erro
  comum não passe despercebido.

**Antisserrilhado (US2)**

- **FR-012**: Cada quadro MUST deslocar a posição da amostra dentro do pixel por uma sequência fixa, aplicada de forma
  coerente à rasterização, aos raios traçados (refração, GI de tela, cáusticas vistas) e às sombras.
- **FR-013**: O motor MUST produzir vetores de movimento para geometria rígida, deformada, instanciada e simulada.
- **FR-014**: O acúmulo MUST rejeitar ou limitar o histórico quando o conteúdo do pixel muda (desoclusão, mudança do que
  está atrás de um transmissivo, mudança de iluminação), e descartá-lo em corte de câmera.
- **FR-015**: Padrões procedurais e texturas MUST ser filtrados pelas derivadas do pixel; a rugosidade especular MUST
  considerar a variação da normal dentro do pixel; a borda da sombra MUST ser filtrada.
- **FR-016**: O antisserrilhado MUST ser um recurso único do motor, ligado por padrão e desligável, usado por todos os
  passes; nenhum passe mantém histórico próprio duplicado sem justificar por medida.

**Luz global e névoa (US3)**

- **FR-017**: A coleta de tela da GI MUST convergir: histerese sem teto fixo enquanto não há transiente, contenção de
  amostras extremas relativa à média lenta, filtro que não empurra o ruído para baixa frequência, e raios pela face de
  trás fora da média.
- **FR-018**: A leitura das sondas MUST evitar fuga e escurecimento junto às quinas, com pesos de visibilidade com piso
  positivo e interpolação filtrada nos rebatimentos ≥ 2.
- **FR-019**: O estado de resposta de cada sonda MUST ser calculado antes do acúmulo, sem corrida entre texels.
- **FR-020**: A normalização das cáusticas MUST conservar o fluxo em qualquer altura e inclinação do receptor.
- **FR-021**: A névoa MUST esconder a estrutura dos froxels (amostras deslocadas e histórico com rejeição de FR-012 e
  FR-014).

**Prontidão (US4)**

- **FR-022**: O motor MUST expor o estado de prontidão como Resource e evento: preparando enquanto houver compilação,
  verificação ou troca de pipeline em voo; pronto quando nada estiver pendente.
- **FR-023**: A espera da prontidão MUST ter prazo, com erro que nomeia o pipeline; falhas de compilação depois do
  descarte da cena MUST ser absorvidas sem erro de página.
- **FR-024**: O tempo da simulação e as sequências de amostras MUST depender só dos passos dados, nunca da velocidade de
  compilação; o relógio nunca é desfeito.
- **FR-025**: Um consumidor obrigatório que não chega MUST gerar aviso (H2), em vez de espera silenciosa.

**Medidas e smokes herdados (US5)**

- **FR-026**: O profiler de GPU MUST entregar uma leitura própria por quadro com a CPU à frente da GPU (vários
  buffers de leitura em rodízio, limite de quadros em voo), sem repetir leituras.
- **FR-026a**: Marcações de depuração e tempos de GPU MUST ser estruturais e por camada: a C1 oferece as
  primitivas (etiqueta em todo objeto e passe, grupos de depuração aninhados, par de timestamps por passe e o escopo
  de cada passe); a C2 abre um escopo por fase e por Flow em toda gravação, de forma automática, e agrega os tempos por
  escopo (fase → Flow → passe) numa leitura por quadro; C3/C4 só nomeiam os próprios passes e nunca chamam as
  primitivas da C1. O tempo de cada Flow e de cada fase MUST chegar ao `gpuFrameTimed` e ao `DebugFlow`; as capturas do
  quadro em ferramentas externas (Xcode/Metal, PIX, RenderDoc) MUST mostrar a árvore fase → Flow → passe com nomes.
- **FR-027**: As seis checagens quebradas desde `5ef1dd4` e H4/H5 MUST ser resolvidas no motor, conferindo AgX contra a
  curva de referência, exposição padrão, níveis das luzes e do hemisfério e especular dos materiais de teste; mudança de
  critério só com medida apresentada e decisão do usuário.

**Vídeo (US6)**

- **FR-028**: A ferramenta de vídeo MUST ler cada quadro direto da GPU (o quadro apresentado em 8 bits, ou o HDR com o
  mapeamento de tons em 10 bits), sem passar pelo canvas 2D nem por JPEG.
- **FR-029**: A gravação MUST ser quadro a quadro com passo fixo, começar só após a prontidão e gerar um arquivo que
  abre no celular em alta qualidade, com opção de um arquivo sem perdas.
- **FR-030**: Leitura de volta só na ferramenta; o motor nunca lê de volta por quadro para gravar.
- **FR-031**: Todo processo externo da gravação (navegador, codificador) MUST ter prazo e ser encerrado em qualquer
  saída, inclusive erro.

**Sem regressão (US7)**

- **FR-032**: Qualquer reordenação da vizinhança das partículas MUST manter a lista de vizinhos e a trajetória bit a
  bit, inclusive para partículas fora da grade, provado por teste contra o develop.
- **FR-033**: A sombra direcional com penumbra da fonte MUST ter bias do plano receptor e caixa ajustada ao que a câmera
  vê; as fixtures de imagem MUST ser regravadas em cada perfil de GPU validado.
- **FR-034**: Todo pipeline MUST caber nos limites WebGPU padrão (storage buffers por estágio, bindings, tamanhos);
  um teste MUST compor todos os pipelines da 034 com os limites padrão.
- **FR-035**: `scene/graph` MUST entrar na lista de contratos da C2 importáveis por C3/C4, e o lint MUST pegar
  importações fora dela.
- **FR-036**: Cada símbolo WGSL novo MUST ser definido uma vez.

**Pendências da fase (US8)**

- **FR-037**: H3 (p95 de `particles/64k-water`) e G3 (p99 de `rigid-bodies/10k`) MUST ser medidos com o profiler
  corrigido e fechados no motor, ou ter a causa medida registrada com decisão do usuário.
- **FR-038**: Os acertos dos raios MUST filtrar texturas e padrões procedurais pela abertura do raio (cone ou
  diferenciais), o equivalente às derivadas de tela (H6).
- **FR-039**: Sem efeitos de pós, o quadro MUST chegar à tela sem passe de cópia extra (G2).
- **FR-040**: A água (011 US4) MUST seguir a regra física: composição pelo traçado da US1, sem a cópia própria da tela
  nem leitura bicúbica dela; `roughness` e as obsolescências do `FluidSurfaceMaterial`; Fresnel exato e GGX; cáusticas
  por método físico (fótons da 033 com a normalização corrigida ou malha refratada até o receptor pela razão de áreas),
  escolhido no plano por medida; os casos `water-fresnel`, `water-absorption`, `water-highlight`, `caustics-smooth` e
  `caustics-temporal`. As tarefas da 011 que usavam a cópia da tela (T084, T087) ficam substituídas.
- **FR-041**: O custo da apresentação HDR MUST ser medido e registrado (011 T110).
- **FR-042**: Os guias da 011 (materiais, luz, apresentação, grafos, pós, ordem dos passes; T104–T108) MUST ser
  escritos ou atualizados com o estado depois da 034, e os vídeos da 011 que não dependem da 035 (água e cáusticas de
  perto; T112) gravados.
- **FR-043**: Toda caixa aberta das specs 001–033 e todo item aberto do `PENDENCIAS.md` MUST ter estado conferido no
  código e destino registrado; as feitas são marcadas com a evidência.

### Key Entities

- **Meio**: índice de refração (por canal, com Abbe), coeficientes de absorção e espalhamento; empilhado na entrada.
- **Caminho de refração**: sequência de interfaces atravessadas por canal, com o meio corrente e a energia restante.
- **Histórico de imagem**: cor acumulada, momentos para a rejeição, idade por pixel; descartado em corte.
- **Vetores de movimento**: deslocamento na tela de cada pixel entre o quadro anterior e o atual.
- **Prontidão**: estado do motor (preparando/pronto), lista do que está pendente e o prazo.
- **Gravação**: cena, número de quadros, passo, formato e destino; quadros lidos da GPU.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Refração: as seis cenas da US1 a ≤ 3 % da referência da CPU na média por região (rugosidade ≤ 5 %);
  lente de 4×: 0 degraus de pixel na borda do xadrez; 0 leituras da cópia da tela por transmissivos.
- **SC-002**: Refração idêntica (≤ 0,5 % por região) com a GI ligada, desligada ou ausente, descontada a luz indireta
  das superfícies de trás.
- **SC-003**: Todas as cenas dos smokes e das demos abrem no Apple M4 e na RTX 4090 sem erro de limite de dispositivo.
- **SC-004**: Antisserrilhado parado: erro médio ≤ 1 % e erro nas bordas ≤ 3 % contra a referência de 64 amostras por
  pixel, após 16 quadros.
- **SC-005**: Em movimento: rastro de um objeto que sai do pixel ≤ 1 % da sua luminância após 4 quadros; borrão atrás
  do vidro com câmera a 30°/s ≤ 1,5× a largura da borda na referência em movimento.
- **SC-006**: GI parada em `medium` e `high` (cômodo com janela e Cornell): viés por face ≤ 5 %, manchas ≤ 2 %,
  cintilação por pixel ≤ 1 %; névoa com câmera andando: cintilação ≤ 1 % e nenhuma periodicidade na escala do froxel.
- **SC-007**: Fluxo da cáustica a ≤ 5 % da referência em três alturas e num plano a 30°.
- **SC-008**: Prontidão: a medida da névoa após a prontidão é igual (≤ 0,5 %) com e sem espera extra; trajetórias
  idênticas bit a bit com compilação lenta forçada.
- **SC-009**: ≥ 90 leituras distintas de tempo de GPU nos smokes de desempenho; as seis checagens e H4/H5 verdes com o
  critério original (ou decisão registrada do usuário).
- **SC-009a**: Toda gravação de quadro sai com um grupo de depuração por fase e por Flow (0 passes sem etiqueta); a
  soma dos tempos por Flow fica a ≤ 2 % do tempo do quadro no M4; o custo das marcações com o profiling desligado é
  0 passes e 0 consultas extras.
- **SC-010**: Vídeo: em cada quadro decodificado, brilho (luma) ≥ 50 dB de PSNR contra o quadro lido da GPU e RGB ≥ 45
  dB contra o mesmo quadro já convertido para 4:2:0 (a subamostragem de cor do formato que abre no celular não conta
  contra o vídeo — decisão do usuário, 2026-10-20: só a conversão 4:2:0 dá 45,25 dB na Cornell); 0 processos órfãos
  após gravação ou falha.
- **SC-011**: Orçamento no M4 a 1280×720: antisserrilhado ≤ 1,5 ms (9 % do quadro de 60 Hz); refração na cena da lente
  ≤ 3 ms (18 %); GI com as correções ≤ orçamento da 033 + 10 %.
- **SC-012**: Bench do Mac sem regressão > 10 % de GPU em nenhuma cena contra o baseline; `instances/100k`,
  `10k-functions` e GI desligada nos valores do baseline.
- **SC-013**: Todos os smokes verdes no fonte e com `--dist` no M4 em 3 rodadas, 0 erros de página; `npm run ci` verde;
  os mesmos smokes na 4090 pela outra máquina.
- **SC-014**: Vídeos das demos e das cenas da US1–US3 gravados pela nova ferramenta e enviados ao usuário.
- **SC-015**: H3 e G3 com número medido (≥ 90 leituras) e o p95/p99 dentro do quadro de 60 Hz no M4, ou causa medida
  com decisão registrada.
- **SC-016**: Textura vista por um raio a 4× de ampliação: 0 serrilhado acima do limite de SC-004; cena sem pós: 0
  passes de cópia para a tela.
- **SC-017**: Água: `water-fresnel` ≤ 2 p.p., `water-absorption` ≤ 3 %, realce > 1 no HDR, cáusticas de perto sem
  platôs de borda reta e com variação temporal limitada à da superfície; 0 leituras da cópia da tela pela água.
- **SC-018**: 0 caixas `- [ ]` nas specs 001–033 sem estado e destino; `PENDENCIAS.md` reescrito sem registro falso.

## Assumptions

- Os orçamentos de SC-011 e os limites de SC-004/SC-005/SC-006/SC-010 seguem o princípio dos limiares (exatidão contra
  referência; tempo como fração do quadro de 60 Hz, piso M4); aceitos pelo usuário em 2026-10-20 ("Prossiga").
- O traçador de caminhos da CPU (033) é estendido com a pilha de meios e a dispersão como referência; a referência
  supersamplada do antisserrilhado é renderizada pelo próprio motor com 64 amostras por pixel e acúmulo sem rejeição
  com a cena parada, e pela CPU onde a cena couber.
- A RTX 4090 é validada pela outra máquina; a 034 não depende dela para fechar no Mac, mas nada pode ser específico de
  nenhuma das duas.
- Fora do escopo, com destino: 011 US5 (biblioteca de materiais) e US6 (comparação com o Three.js) → 035, o fechamento
  da 011 (decisão do usuário, 2026-10-20); FFT do oceano e água em grande escala → 029; solver da água (δ-SPH/DFSPH,
  O7, O8) → 036 (a 035 passou a ser o fechamento da 011); P1–P9, E1, E4 → F5; N1–N6 → F8;
  001 T029 bloqueada até o `claflow-web` existir nesta máquina; desperdícios D1–D10 e modularidade M1–M5 da análise da
  4090 → spec própria, salvo o que a 034 tocar.
- A física local das partículas acionada por colisão em terreno, areia e oceano é política geral (registrada) e entra
  nas specs da 029 e de terreno, não na 034.
