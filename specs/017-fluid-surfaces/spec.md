# Feature Specification: Superfície de fluido — água contínua com cáusticas

**Feature Branch**: `feature/017-fluid-surfaces`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Superfície de fluido com cáusticas (spec 017, fase F5 do roadmap — `017-fluid-surfaces`).
Implementar no lugar arquitetural certo (C1–C4, `architecture_resource_loaders.md` autoritativo), sem helpers nem atalhos
(Resource + evento + Flow), motor agnóstico, o item "superfície de fluido" do ROADMAP §5 (linha F5, 017) e a pendência
P10 de `specs/PENDENCIAS.md`: água contínua no lugar das esferas, desenhada a partir das partículas dos corpos de fluido
(SPH/PBF, e MPM quando fluido) lidas direto do pool na GPU, sem leitura de volta para a CPU. Pedido explícito do usuário:
incluir cáusticas — a luz refratada pela superfície concentrada no fundo e nos objetos submersos, coerente com a luz da
cena. Abordagem recomendada: superfície em espaço de tela (profundidade das partículas, suavização preservando bordas,
normais reconstruídas, espessura; refração do fundo, reflexão, absorção/cor por espessura, Fresnel), com isosuperfície
(marching cubes) avaliada como alternativa no research. A superfície é escolhida pelo material do corpo, coexistindo com o
`ParticleFlow` da 008. Critérios: água contínua visível nas cenas de fluido (SPH/PBF, barragem de 36 864 partículas) com
cáusticas no fundo; sem leitura de volta por quadro; sem regressão de `bench:check`, baseline regravado ao fim, com a cena
`particles` medindo também a superfície; imagens existentes idênticas; mesma trajetória a 30/60/144 Hz; build
minificado; smokes com `--dist`; gate completo verde. Fora de escopo: HDR/PBR completo, IBL e pós (F4), colisores de
fluido e acoplamento entre solvers (F5/015–016), espuma/spray como emissores (F9), espaços não euclidianos (F6). Branch:
feature/017-fluid-surfaces a partir de develop."

## Contexto e Problema

A 008 pôs os fluidos na tela, mas como esferas: cada partícula é um sprite (`ParticleFlow`, `PointSpriteMaterial`).
Levantamento no código (`develop` em `3a808c4`):

| Lacuna                 | Estado atual (evidência)                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Água não é contínua    | O único desenho de fluido são sprites por partícula (`presentation/flows/ParticleFlow.ts`); a barragem de 36 864 partículas aparece como um monte de bolinhas, não como água (P10) |
| Sem material de fluido | Só `PointSpriteMaterial` (cor e raio) serve a corpos de partículas; não há como declarar cor da água, absorção, índice de refração ou reflexão                                     |
| Sem transmissão de luz | O forward desenha opacos; nada atrás de um fluido aparece através dele, e nenhum estágio lê a cor da cena já desenhada para refratá-la                                             |
| Sem cáusticas          | A luz que atravessa a água não é concentrada em lugar nenhum: o fundo de um tanque recebe a mesma luz (ou a mesma sombra) com ou sem água em cima                                  |
| Sombra da água         | O fluido não projeta sombra hoje (sprites seguem `castsShadow` de pontos); a água precisa atenuar a luz que passa, não bloqueá-la como um opaco                                    |

Esta spec entrega água contínua e cáusticas a partir do estado da simulação na GPU, sem alterar a simulação.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Fluido desenhado como água contínua (Priority: P1)

O desenvolvedor dá a um corpo de fluido um material de superfície de fluido e vê uma superfície lisa e contínua, que se
move com a simulação, no lugar das partículas individuais.

**Why this priority**: É a pendência P10 e o motivo da spec: sem superfície, o fluido não se lê como água.

**Independent Test**: A barragem de 36 864 partículas SPH com o material de superfície; capturar quadros e verificar
que a região do fluido é preenchida sem buracos entre partículas vizinhas, que as bordas acompanham as partículas e que a
imagem muda com a simulação.

**Acceptance Scenarios**:

1. **Given** um fluido SPH com material de superfície de fluido, **When** a aplicação roda, **Then** a região ocupada
   pelas partículas aparece como uma superfície contínua, sem o contorno de esferas individuais nem buracos entre
   partículas vizinhas.
2. **Given** a mesma montagem com PBF ou MPM fluido, **When** a aplicação roda, **Then** o resultado segue a mesma
   regra sem código diferente do lado do desenvolvedor.
3. **Given** um fluido com superfície e caixas na cena, **When** a cena é desenhada, **Then** a superfície e as caixas se
   ocultam corretamente pela profundidade (caixa na frente cobre a água; água na frente cobre a caixa).
4. **Given** um fluido com superfície, **When** um quadro é desenhado, **Then** nenhuma posição é lida de volta para a CPU
   e a simulação dá exatamente a mesma trajetória que sem superfície.
5. **Given** a superfície iluminada pela luz da cena, **When** a luz muda de direção, **Then** o brilho especular e o
   sombreamento da superfície acompanham.

---

### User Story 2 - A água tem aparência de água (Priority: P1)

O que está atrás e embaixo da água aparece através dela, distorcido pela refração e tingido pela cor da água conforme a
espessura atravessada; a superfície reflete mais em ângulos rasantes.

**Why this priority**: Uma superfície contínua opaca parece gelatina; transparência, refração, absorção e reflexão são o
que faz água ser água, e a refração é o pré-requisito físico das cáusticas.

**Independent Test**: Um tanque com o fundo quadriculado e uma caixa submersa; verificar que o quadriculado aparece
através da água, deslocado onde a superfície é inclinada, mais tingido onde a água é funda, e que a reflexão cresce ao
baixar a câmera para um ângulo rasante.

**Acceptance Scenarios**:

1. **Given** um fundo com padrão sob uma camada fina de água, **When** desenhado, **Then** o padrão aparece através da
   água quase sem tinta; sob uma camada funda, aparece mais tingido e escuro (absorção por espessura).
2. **Given** a superfície inclinada (onda), **When** desenhada, **Then** o fundo visto através dela aparece deslocado no
   sentido da refração; com a água parada e plana, sem deslocamento perceptível.
3. **Given** a câmera olhando a água de cima e depois em ângulo rasante, **When** desenhada, **Then** a parcela refletida
   cresce no ângulo rasante (Fresnel).
4. **Given** o material com cor, coeficientes de absorção, índice de refração e opacidade escolhidos, **When** alterados
   em tempo de execução, **Then** a aparência muda no quadro seguinte.

---

### User Story 3 - Cáusticas no fundo e nos objetos submersos (Priority: P1)

A luz que atravessa a superfície se concentra e se espalha conforme a curvatura da água, desenhando padrões claros e
móveis no fundo e nos objetos submersos, coerentes com a direção da luz e com o movimento da água.

**Why this priority**: Pedido explícito do usuário; é a assinatura visual de água iluminada.

**Independent Test**: Tanque iluminado por uma luz direcional com sombra; com a água agitada, verificar no fundo regiões
mais claras que a iluminação sem água e regiões mais escuras ao redor, que mudam entre quadros; com a água parada e plana,
iluminação do fundo uniforme; sem água, o fundo idêntico à cena sem cáusticas.

**Acceptance Scenarios**:

1. **Given** água agitada sob uma luz direcional, **When** a cena é desenhada, **Then** o fundo do tanque mostra padrões
   de concentração de luz (mais claros que a luz direta) e de dispersão (mais escuros), que se movem com a superfície.
2. **Given** a luz em outra direção, **When** a cena é desenhada, **Then** as cáusticas se deslocam de acordo com a
   refração pela nova direção.
3. **Given** um objeto submerso, **When** a cena é desenhada, **Then** recebe cáusticas na face voltada para a luz e a
   água continua a não bloquear a luz como um opaco.
4. **Given** uma região fora da água (ou sem água acima), **When** desenhada, **Then** recebe a mesma iluminação e sombra
   de uma cena sem fluido.
5. **Given** o material com cáusticas desligadas, **When** desenhada, **Then** o fundo recebe a luz atenuada pela água,
   sem padrão.

---

### User Story 4 - Escolha pelo material e coexistência (Priority: P2)

O desenvolvedor escolhe, pelo material do corpo, sprites (008) ou superfície; vários corpos de fluido coexistem na
cena, cada um com o seu material, e o custo da superfície só existe quando há um corpo que a usa.

**Why this priority**: Mantém a 008 intacta e o motor agnóstico: a superfície é uma capacidade do material, não um modo
global.

**Independent Test**: Cena com um fluido de sprites e outro com superfície; verificar os dois desenhos, trocar o
material de um corpo em tempo de execução e verificar que o desenho troca; sem nenhum corpo com superfície, verificar que
os passes da superfície não rodam.

**Acceptance Scenarios**:

1. **Given** um fluido com `PointSpriteMaterial` e outro com material de superfície, **When** desenhados, **Then** o
   primeiro aparece como sprites e o segundo como água.
2. **Given** dois corpos com material de superfície que se tocam, **When** desenhados, **Then** formam uma superfície
   contínua onde se encontram, se tiverem o mesmo material; com materiais diferentes, cada um mantém a sua aparência.
3. **Given** a troca do material de um corpo em tempo de execução, **When** o próximo quadro é desenhado, **Then** o
   corpo aparece no desenho do material novo, sem recriar o corpo nem alterar a simulação.
4. **Given** nenhuma entidade com material de superfície, **When** os quadros são desenhados, **Then** o custo de GPU
   por quadro é o mesmo de antes desta spec (nenhum passe de superfície nem de cáusticas roda) e as imagens de render
   existentes são idênticas.

---

### User Story 5 - Medição e regressão (Priority: P2)

O mantenedor mede o custo da superfície e das cáusticas no benchmark e tem imagens de referência que travam a
aparência.

**Why this priority**: Gate do projeto: nenhuma capacidade entra sem medida e sem referência.

**Independent Test**: Rodar a cena `particles` do benchmark na variante com superfície e os smokes novos com fixture.

**Acceptance Scenarios**:

1. **Given** a cena `particles` do benchmark, **When** rodada na variante com superfície e cáusticas, **Then** o relatório
   traz CPU e GPU por quadro, com o custo da superfície separável do custo da simulação.
2. **Given** os smokes de superfície, **When** rodados duas vezes seguidas, **Then** as imagens são idênticas entre si e
   iguais à fixture.

---

### Edge Cases

- Partícula isolada ou gotas pequenas: aparecem como pequenas gotas arredondadas, não somem nem viram quadrados.
- Poucas partículas (fluido quase vazio) e corpo com zero partículas vivas: sem artefatos; nada desenhado no último caso.
- Câmera dentro da água ou cortando a superfície no plano próximo: sem cor inválida nem tela preta; a parte além do plano
  próximo é desenhada como a vista de dentro (tingida pela absorção).
- Fluido parcialmente fora da tela: a suavização não cria bordas falsas no limite da tela.
- Superfície na frente de outro fluido com superfície: o mais próximo da câmera vence onde se sobrepõem; o de trás aparece
  pela refração.
- Bordas de silhueta (água na frente de fundo distante): a suavização não mistura a profundidade da água com a do fundo
  (sem "halo" nem "cortina" entre a borda e o fundo).
- Partícula com posição não finita: não contamina a superfície nem as cáusticas.
- Nenhuma luz, ou luz sem mapa de sombra: a superfície é desenhada (reflexão, refração, absorção); as cáusticas daquela
  luz não aparecem, sem erro.
- Várias luzes: cada luz que projeta sombra contribui com as suas cáusticas, até o limite declarado; as excedentes não
  geram cáusticas e isso é avisado uma vez.
- Redimensionamento do canvas e troca de MSAA (`antialias: false`): a superfície continua correta; os alvos são
  recriados com o canvas.
- Fluido sem material de superfície e sem `PointSpriteMaterial`: não é desenhado (regra da 008).
- Remoção do corpo ou do material com superfície: os passes param e os recursos são liberados (ou reaproveitados).

## Requirements _(mandatory)_

### Functional Requirements

**Material e escolha do desenho**

- **FR-001**: MUST existir um material de superfície de fluido com, no mínimo: cor da água, coeficientes de absorção por
  canal, índice de refração, intensidade de reflexão, cor do ambiente refletido, brilho especular, escala da suavização,
  e liga/desliga e intensidade das cáusticas; todos com padrões que dão água clara.
- **FR-002**: A superfície MUST ser desenhada para todo corpo de partículas de fluido (SPH, PBF, MPM fluido) com esse
  material, sem código específico por algoritmo no desenvolvedor; a posição MUST ser lida do pool do corpo, como na 008.
- **FR-003**: Corpos com `PointSpriteMaterial` MUST continuar desenhados como sprites (008) sem mudança; corpos dos dois
  tipos MUST coexistir na mesma cena.
- **FR-004**: A troca de material de um corpo em tempo de execução MUST trocar o desenho no quadro seguinte, sem alterar
  a simulação nem recriar o corpo.
- **FR-005**: Corpos com o mesmo material de superfície MUST formar uma superfície única onde se tocam; materiais
  diferentes MUST manter aparências separadas.

**Superfície**

- **FR-006**: A superfície MUST ser contínua sobre a região ocupada pelas partículas: sem buracos entre partículas
  vizinhas no espaçamento de repouso do fluido e sem o contorno de esferas individuais visível no interior.
- **FR-007**: A suavização MUST preservar as silhuetas: não misturar profundidades separadas por uma descontinuidade
  maior que a declarada no material.
- **FR-008**: A superfície MUST ter normal por pixel coerente com a forma e participar do teste de profundidade com o
  resto da cena.
- **FR-009**: A superfície MUST ser iluminada pelas luzes da cena (difusa/especular conforme o material) e receber a
  sombra dos objetos opacos.
- **FR-010**: O método da superfície (espaço de tela ou isosuperfície) MUST ser decidido no research com medição; a
  escolha MUST atender FR-006–FR-009 e os critérios de desempenho, e a alternativa descartada MUST ficar registrada.

**Óptica**

- **FR-011**: O que está atrás da água MUST aparecer através dela, deslocado pela refração segundo a normal da superfície
  e o índice de refração.
- **FR-012**: A cor transmitida MUST ser atenuada pela espessura de água atravessada (absorção exponencial por canal).
- **FR-013**: A parcela refletida MUST seguir Fresnel pelo índice de refração; o que é refletido é a cor do ambiente do
  material mais os realces especulares das luzes (reflexão do ambiente real fica com IBL na F4).
- **FR-014**: A refração MUST usar a cena desenhada antes da água (opacos, sprites e, se houver, outra água atrás) e
  nunca amostrar a própria água da frente nem objetos na frente da superfície.

**Cáusticas**

- **FR-015**: Para cada luz direcional que projeta sombra (a única com mapa de sombra hoje; até o limite declarado no
  plano), a luz que atravessa a superfície MUST ser refratada e concentrada nas superfícies receptoras abaixo (fundo e
  objetos submersos), produzindo regiões mais claras e mais escuras que a iluminação sem água, conforme a curvatura da
  água.
- **FR-016**: As cáusticas MUST mover-se com a água e com a direção da luz no mesmo quadro (sem atraso de quadros).
- **FR-017**: A água MUST atenuar a luz que a atravessa (absorção) em vez de bloqueá-la como um opaco: o que está
  embaixo d'água não fica na sombra da água.
- **FR-018**: Regiões sem água entre elas e a luz MUST receber a mesma iluminação e sombra de uma cena sem fluido.
- **FR-019**: A energia luminosa MUST ser aproximadamente conservada: com a água plana e parada, a iluminação média do
  fundo sob a água é a luz direta atenuada pela absorção, sem padrão; com a água agitada, a média regional se mantém
  dentro da tolerância declarada no plano.
- **FR-020**: Luzes sem mapa de sombra ou além do limite MUST não gerar cáusticas, sem erro; o excedente MUST ser
  avisado uma vez.

**Arquitetura e custo**

- **FR-021**: Toda a cadeia (superfície, óptica, cáusticas) MUST rodar na GPU a partir do pool, sem leitura de volta por
  quadro e sem escrita da CPU de dados por partícula.
- **FR-022**: Os recursos dos passes (alvos intermediários, mapas de cáustica) MUST ser Resources alocados pela C2,
  recriados com o canvas e com a troca de MSAA, e os estágios MUST ser Flows registrados nas fases do quadro, ligados por
  slots e eventos — sem helpers fora da arquitetura (C3/C4 sem importar a C1 diretamente).
- **FR-023**: Sem nenhum corpo com material de superfície, nenhum passe de superfície ou cáustica MUST rodar e nenhum
  recurso dele MUST ser alocado.
- **FR-024**: A simulação MUST ser idêntica com ou sem superfície: as trajetórias das sete cenas de física iguais a 30,
  60 e 144 Hz.
- **FR-025**: A superfície MUST funcionar em LDR com o MSAA da 008 ligado ou desligado, e o desenho MUST ser adaptável ao
  HDR da F4 sem refazer a cadeia.

**Preservação e verificação**

- **FR-026**: As imagens das cenas de render existentes e as fixtures de sprites da 008 MUST continuar idênticas.
- **FR-027**: MUST existir smoke com imagem de referência para: superfície de SPH, PBF e MPM fluido; refração e
  absorção sobre fundo com padrão; cáusticas no fundo e em objeto submerso; coexistência sprites + superfície; câmera
  dentro da água.
- **FR-028**: A cena `particles` do benchmark MUST ganhar a variante com superfície e cáusticas, medindo CPU e GPU por
  quadro; `bench:check` MUST passar sem regressão contra o baseline vigente e o baseline MUST ser regravado ao fim.
- **FR-029**: Nenhum struct MUST ser duplicado entre TypeScript e WGSL; o build minificado MUST funcionar; smokes MUST
  passar no código-fonte e com `--dist`.
- **FR-030**: O documento de arquitetura, o guia de migração (se houver mudança incompatível), o ROADMAP e o PENDENCIAS
  (P10 resolvida) MUST descrever o estado novo.

### Key Entities

- **Material de superfície de fluido**: parâmetros ópticos da água (cor, absorção, índice de refração, reflexão,
  especular, suavização, cáusticas); escolhe o desenho de superfície para o corpo.
- **Superfície de fluido**: a fronteira contínua da região ocupada pelas partículas de um ou mais corpos com o mesmo
  material, com profundidade, normal e espessura por pixel.
- **Cena atrás da água**: a cor e a profundidade da cena desenhada antes da água, fonte da refração.
- **Mapa de cáusticas**: por luz, a distribuição da luz refratada pela água sobre as superfícies receptoras, consumida
  pela iluminação do fundo e dos objetos submersos.

## Success Criteria _(mandatory)_

Medidos na máquina de referência livre, no protocolo do benchmark, a 1280×720.

### Measurable Outcomes

- **SC-001**: Continuidade: na barragem de 36 864 partículas em repouso, 0 pixels de fundo visíveis através de buracos
  no interior da região do fluido (verificado na fixture com a absorção máxima), e o contorno de partícula individual não
  aparece no interior.
- **SC-002**: Água visível e animada para SPH, PBF e MPM fluido: cada smoke de imagem confere com a referência e a imagem
  muda entre os quadros 20 e 60.
- **SC-003**: Cáusticas: com a água agitada, o fundo sob a água tem regiões ao menos 30% mais claras e regiões ao menos
  20% mais escuras que a luz direta atenuada; com a água plana, variação do fundo sob a água ≤ 5%; sem água, o fundo
  idêntico (0 pixels diferentes) à cena sem fluido.
- **SC-004**: Refração e absorção: o padrão do fundo é reconhecível através de água rasa e a luminância transmitida cai
  monotonicamente com a profundidade da água (medida em 3 profundidades).
- **SC-005**: Desempenho: barragem de 36 864 partículas com superfície e cáusticas a pelo menos 60 fps de intervalo de
  quadro; com 65 536 partículas, o custo de GPU de superfície + cáusticas ≤ 3 ms por quadro acima da mesma cena com
  sprites.
- **SC-006**: 0 leituras GPU→CPU por quadro e 0 escritas da CPU de dados por partícula nas cenas com superfície (contado
  em teste).
- **SC-007**: Trajetórias das sete cenas de física idênticas a 30, 60 e 144 Hz.
- **SC-008**: Sem corpo com superfície, GPU por quadro das cenas existentes dentro do ruído do baseline e imagens
  idênticas (0 pixels diferentes).
- **SC-009**: `bench:check` sem regressão > 10% contra o baseline vigente; baseline regravado ao fim.
- **SC-010**: Gate completo verde (format, lint, tsc, `test:coverage`, `build:lib`, `doc:coverage`); todos os smokes
  passam no código-fonte e com `--dist`.

## Assumptions

- O método recomendado é a superfície em espaço de tela; a isosuperfície (marching cubes sobre um campo de densidade em
  grade) é avaliada no research e só é escolhida se medir melhor nos critérios.
- As cáusticas são calculadas por luz no espaço da luz, reaproveitando o mapa de sombra (projeção ortográfica da luz
  direcional, `shadow_matrix.wgsl`) como receptor; spot e pontuais não têm sombra hoje e ganham cáusticas quando a F4/013
  trouxer a sombra delas.
- A reflexão usa a cor de ambiente do material e os realces especulares; reflexão do ambiente real e do céu fica com
  IBL/reflexões da F4.
- Render em LDR (8 bits por canal); o HDR da F4 recebe a mesma cadeia trocando o formato dos alvos.
- A superfície não é geometria de colisão nem é lida pela física; a simulação não muda.
- Tensão superficial, espuma, spray e bolhas não fazem parte (simulação na F5/016, efeitos na F9).
- O teto de 65 536 partículas por algoritmo (E4) continua.
- A ordem dos estágios é a das fases existentes: a água é desenhada depois dos opacos e dos sprites e antes do pós.
- O MorphSociety e qualquer outro consumidor usam a capacidade pelo material; nada específico de jogo entra no motor.

## Out of Scope

- HDR, PBR completo, IBL, reflexões em espaço de tela e pós-processamento (F4).
- Sombra de luzes spot e pontuais (F4/013) e, com ela, cáusticas dessas luzes.
- Colisores de fluido, acoplamento entre solvers e tensão superficial (F5/015–016, P7).
- Espuma, spray e bolhas como partículas emitidas (F9).
- Espaços não euclidianos (F6).
- Aumento do teto de partículas (E4).
