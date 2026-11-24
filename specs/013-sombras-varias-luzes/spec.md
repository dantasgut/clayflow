# Feature Specification: Sombras para várias fontes de luz

**Feature Branch**: `feature/013-sombras-varias-luzes`

**Created**: 2026-11-24

**Status**: Draft

**Input**: User description: "Vamos precisar entregar a 11 como está e voltar após concluir sombra para mais de uma
fonte de luz" e, com os pedidos de integração aprovados, "vamos as sombras para várias fontes de luz" (2026-11-24).
Antes: "por que não foi feita de largada sombra para mais de uma luz?" — a spec 011 (FR-009) deixou "as demais luzes
não têm sombra nesta spec (013)" e a 034 refez o mapa de sombra só para a primeira luz.

## Contexto e Problema

Hoje uma cena tem sombra de **uma** luz: a primeira luz direcional marcada para projetar. As consequências, medidas
nas cenas do rosto da spec 011:

- **Uma segunda luz marcada para projetar sombra é aceita sem aviso e dá resultado errado.** A sombra dela sai de
  dados que pertencem à primeira; a luz que atravessa as partes finas de um material translúcido (a orelha, a narina,
  a borda do rosto) sai em manchas brancas e pisca de um quadro para o outro.
- **As luzes de área não projetam sombra.** Num retrato iluminado por caixas de luz, as órbitas, a base do nariz e o
  lábio inferior não escurecem e o globo ocular, recuado sob a pálpebra, sai branco.
- **As luzes pontuais e de foco não projetam sombra.**
- **A luz que atravessa um corpo translúcido só existe para a luz que tem sombra.** Com a contraluz e a luz principal,
  só uma das duas pode acender a orelha ou marcar o terminador no rosto.

Quem monta uma cena espera o que qualquer motor de apresentação entrega: cada luz que deveria fazer sombra faz, e a
sombra de uma não interfere na de outra.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Várias luzes direcionais com sombra (Priority: P1)

Quem monta a cena põe duas ou mais luzes direcionais marcadas para projetar sombra — a principal, o preenchimento, a
contraluz — e cada uma faz a sua sombra, correta e independente das outras.

**Why this priority**: é o pedido direto e o defeito mais grave de hoje (a segunda luz dá resultado errado em
silêncio). Sem isso nada mais da spec tem base.

**Independent Test**: uma cena de esferas sobre um chão com três luzes direcionais de direções e cores diferentes, as
três com sombra; a imagem comparada com a soma das três imagens de uma luz só.

**Acceptance Scenarios**:

1. **Given** duas luzes direcionais com sombra de direções diferentes, **When** a cena é desenhada, **Then** cada
   objeto projeta duas sombras, cada uma na direção oposta à da sua luz, com a penumbra da sua fonte.
2. **Given** três luzes com sombra de cores diferentes, **When** a cena é desenhada, **Then** a imagem é igual, dentro
   da tolerância, à soma das três imagens em que só uma das luzes está acesa.
3. **Given** uma cena com sombra de uma luz só, **When** desenhada antes e depois desta spec, **Then** a imagem não
   muda.
4. **Given** uma luz com sombra que é apagada, removida ou tem a sombra desligada, **When** o quadro seguinte é
   desenhado, **Then** a sombra dela some e as das outras não mudam.

---

### User Story 2 - Luzes de área com sombra (Priority: P1)

Quem monta a cena ilumina com caixas de luz (retângulos emissores) e elas projetam sombra com a penumbra que o tamanho
da fonte dá: dura junto do contato, larga longe dele, e as reentrâncias de um objeto escurecem porque o próprio objeto
tapa parte da fonte.

**Why this priority**: é o que falta para um retrato parecer iluminado de verdade — o motivo que trouxe o usuário a
esta spec — e é a luz mais usada nas cenas de materiais.

**Independent Test**: um retângulo emissor sobre um anteparo que tapa metade dele visto de um chão; a luz que chega a
cada ponto do chão comparada com a fração da fonte visível daquele ponto, calculada pela referência.

**Acceptance Scenarios**:

1. **Given** uma luz de área e um objeto sobre um chão, **When** a cena é desenhada, **Then** a sombra tem a borda
   nítida junto do contato e larga longe dele, na proporção do tamanho da fonte e das distâncias.
2. **Given** um ponto de onde só parte da fonte é visível, **When** iluminado, **Then** a luz que chega a ele é a da
   fração visível da fonte, dentro da tolerância contra a referência.
3. **Given** a cabeça do retrato sob uma caixa de luz à frente e acima, **When** desenhada, **Then** as órbitas, a base
   do nariz e o lábio inferior ficam mais escuros que a testa e as maçãs do rosto, e o globo ocular fica mais escuro
   que a pele iluminada em volta.
4. **Given** uma luz de área que muda de tamanho, **When** o quadro seguinte é desenhado, **Then** a penumbra acompanha.

---

### User Story 3 - Luzes pontuais e de foco com sombra (Priority: P2)

Quem monta a cena põe uma lâmpada ou um refletor e eles projetam sombra em todas as direções que iluminam.

**Why this priority**: completa os tipos de luz do motor; menos urgente que as duas primeiras porque as cenas de hoje
usam direcionais e caixas de luz.

**Independent Test**: uma luz pontual no meio de uma sala com objetos em volta e uma de foco apontada para um objeto;
a sombra de cada objeto comparada com a posição que a geometria dá.

**Acceptance Scenarios**:

1. **Given** uma luz pontual com objetos em volta, **When** a cena é desenhada, **Then** cada objeto projeta sombra
   para longe da luz, em qualquer direção, sem emenda nem falha entre direções.
2. **Given** uma luz de foco, **When** desenhada, **Then** há sombra dentro do cone e nenhuma luz nem sombra dela fora.
3. **Given** uma luz pontual que anda, **When** os quadros são desenhados, **Then** a sombra acompanha a cada quadro.

---

### User Story 4 - A luz atravessa a pele para qualquer luz com sombra (Priority: P2)

Quem monta um retrato põe a luz principal e a contraluz, as duas com sombra, e tem ao mesmo tempo o terminador
avermelhado no rosto e a orelha acesa pela luz de trás, sem manchas e sem piscar.

**Why this priority**: é o que bloqueou a retomada do rosto da 011; depende das histórias 1 e 2.

**Independent Test**: a cabeça com a luz principal de lado e a contraluz atrás da orelha, as duas com sombra; a orelha
medida com e sem a contraluz, e a diferença entre quadros seguidos com a câmera girando.

**Acceptance Scenarios**:

1. **Given** uma peça fina de material translúcido entre a câmera e uma luz com sombra que não é a primeira da cena,
   **When** desenhada, **Then** a luz atravessa a peça como atravessa quando essa luz é a única.
2. **Given** a cabeça com duas luzes com sombra, **When** a câmera gira, **Then** a luz que atravessa a orelha não
   pisca: a diferença entre quadros seguidos não tem saltos.
3. **Given** um ponto onde a espessura atravessada não pode ser conhecida, **When** desenhado, **Then** nenhuma luz
   atravessa ali (nunca a luz inteira).

---

### User Story 5 - Correto com tudo em movimento (Priority: P1)

Quem anima a cena move as luzes, a câmera e os objetos, e a sombra de cada quadro é a que a cena parada naquele estado
teria.

**Why this priority**: o defeito que gerou esta linha de trabalho só aparecia com a luz em movimento, e nenhum teste o
via. Uma sombra que só está certa parada não está entregue.

**Independent Test**: cada cena das histórias 1 a 3 com as luzes girando ou andando a cada quadro, comparada no último
quadro com a mesma cena parada no estado final.

**Acceptance Scenarios**:

1. **Given** três luzes com sombra girando a velocidades diferentes, **When** o último quadro é desenhado, **Then** ele
   é igual, dentro da tolerância, ao da cena parada nas direções finais.
2. **Given** uma luz de área e uma pontual andando, **When** os quadros são desenhados, **Then** não há sombra
   cortada, deslocada nem faltando em quadro algum.
3. **Given** a câmera andando e um objeto movendo sob várias luzes, **When** desenhado, **Then** a sombra do objeto
   acompanha em todas as luzes.

---

### User Story 6 - Pedido que o motor não atende é avisado (Priority: P1)

Quem pede sombra numa luz além do que o motor atende fica sabendo, em vez de receber uma imagem errada.

**Why this priority**: o silêncio de hoje custou várias rodadas de trabalho contornando sintomas.

**Independent Test**: uma cena com mais luzes com sombra do que o teto; o motor informa quais ficaram sem sombra e as
demais saem corretas.

**Acceptance Scenarios**:

1. **Given** mais luzes com sombra do que o teto declarado, **When** a cena é montada, **Then** o motor informa quais
   luzes ficaram sem sombra, e essas luzes iluminam sem sombra (nunca com sombra errada).
2. **Given** o teto, **When** consultado, **Then** ele é conhecido de quem monta a cena.

---

### User Story 7 - O custo cabe no quadro (Priority: P2)

Quem acrescenta luzes com sombra sabe quanto cada uma custa, e uma cena de retrato com três luzes continua em tempo
real.

**Why this priority**: sombra para várias luzes que não roda em tempo real não serve ao motor.

**Independent Test**: a mesma cena medida com uma, duas, três e quatro luzes com sombra, paradas e em movimento.

**Acceptance Scenarios**:

1. **Given** uma cena com uma luz com sombra, **When** uma segunda é acrescentada, **Then** o custo do quadro sobe no
   máximo o declarado por luz.
2. **Given** luzes com sombra paradas e a câmera parada, **When** os quadros se sucedem, **Then** o custo das sombras
   cai para o de manter o que já está pronto.
3. **Given** uma cena com uma luz com sombra só, **When** medida antes e depois desta spec, **Then** o custo não sobe
   além da tolerância.

---

### Edge Cases

- Duas luzes com sombra na mesma direção: as duas sombras coincidem e a imagem é a de uma luz com a soma das duas.
- Uma luz com sombra de intensidade zero ou apagada: não custa e não deixa resto na imagem.
- Uma luz de área muito pequena: a sombra tende à de uma luz pontual, sem ruído nem falha.
- Uma luz de área encostada ou atravessando um objeto: sem luz vazando para o lado de trás do objeto.
- Uma luz pontual dentro de um objeto fechado: nenhuma luz sai.
- Um objeto muito fino (a orelha, uma folha) entre a luz e o receptor: projeta sombra e não deixa a luz vazar.
- Um objeto grande que entra e sai do alcance de uma luz: a sombra aparece e some sem salto.
- Muitas luzes com sombra iluminando o mesmo ponto: o resultado é a soma, sem estouro nem valor não finito.
- A luz muda de tipo, de tamanho ou liga e desliga a sombra de um quadro para o outro.
- Um salto grande de direção ou de posição de uma luz num quadro só: o quadro seguinte já sai correto.
- Superfícies deslocadas e malhas que deformam (corpo mole) projetam e recebem sombra de todas as luzes.
- Luz com sombra e névoa ou nuvens no caminho: a sombra da geometria e a atenuação do meio se multiplicam, como hoje.
- Reflexos e luz rebatida: o que se vê num reflexo e o que a luz rebatida usa têm a sombra de todas as luzes, ou a
  diferença fica declarada.
- O adaptador com menos memória ou menos recursos: o teto de luzes com sombra se ajusta ao que o adaptador dá e é
  informado.

## Requirements _(mandatory)_

### Functional Requirements

**Várias luzes**

- **FR-001**: Toda luz direcional marcada para projetar sombra DEVE projetar a sua, em qualquer número até o teto
  declarado, cada sombra correta e independente das demais.
- **FR-002**: A sombra de uma luz NÃO DEVE mudar pela presença, ausência, direção ou movimento de outra luz.
- **FR-003**: O teto de luzes com sombra simultâneas DEVE ser declarado, conhecido de quem monta a cena e de pelo menos
  4 luzes direcionais no perfil alto.
- **FR-004**: Uma cena com uma luz com sombra só DEVE produzir a mesma imagem de antes desta spec.

**Luzes de área**

- **FR-005**: As luzes de área DEVEM projetar sombra, com a penumbra dada pelo tamanho da fonte e pelas distâncias.
- **FR-006**: A luz de área que chega a um ponto DEVE ser a da parte da fonte visível daquele ponto, calculada contra
  a geometria da cena a cada quadro.
- **FR-007**: A sombra da luz de área DEVE valer para a luz direta difusa e para o brilho da fonte nos materiais.

**Luzes pontuais e de foco**

- **FR-008**: As luzes pontuais DEVEM projetar sombra em todas as direções, sem emenda.
- **FR-009**: As luzes de foco DEVEM projetar sombra dentro do cone.

**Subsuperfície**

- **FR-010**: A luz que atravessa as partes finas de um material com subsuperfície DEVE valer para toda luz com sombra
  desta spec, com a espessura medida do ponto de vista de cada luz.
- **FR-011**: Onde a espessura atravessada não puder ser conhecida, nenhuma luz DEVE atravessar.

**Avisos**

- **FR-012**: Pedir sombra numa luz que o motor não atende — além do teto ou de um tipo sem sombra — DEVE gerar um
  aviso que nomeia a luz, e essa luz DEVE iluminar sem sombra.
- **FR-013**: O motor NÃO DEVE produzir sombra, espessura ou luz atravessada de uma luz a partir dos dados de outra.

**Movimento**

- **FR-014**: Com qualquer combinação de luzes, câmera e objetos mudando a cada quadro, a sombra de cada quadro DEVE
  ser a da mesma cena parada naquele estado, dentro da tolerância.
- **FR-015**: Uma luz que muda de direção, posição, tamanho ou tipo, ou liga e desliga a sombra, DEVE ter a sombra
  correta no quadro seguinte.

**Estrutura e custo**

- **FR-016**: As sombras de todas as luzes DEVEM usar a mesma estrutura de páginas, tabela, pedidos e orçamento por
  quadro que a sombra de hoje, sem estrutura paralela equivalente.
- **FR-017**: O trabalho de sombra por quadro DEVE ter teto constante, repartido entre as luzes, e o que ficar para o
  quadro seguinte NÃO DEVE aparecer como sombra errada (no máximo como sombra menos fina).
- **FR-018**: Nada do cálculo de sombra por quadro DEVE rodar fora da GPU.
- **FR-019**: O estado guardado entre quadros DEVE passar pelo canal temporal do motor.
- **FR-020**: O que a sombra oferece DEVE se ajustar ao adaptador (teto de luzes, resolução), pelo que ele informa e
  pelo que é medido, sem regra por máquina.

**Integração**

- **FR-021**: A sombra de cada luz DEVE valer em tudo que usa a luz direta: superfícies, subsuperfície, névoa, nuvens
  no chão (junto com a atenuação do meio), superfícies deslocadas e malhas que deformam.
- **FR-022**: Os reflexos traçados e a luz rebatida DEVEM usar a sombra de todas as luzes com sombra, ou a diferença
  DEVE ficar registrada como pendência com a medida dela.

**Validação**

- **FR-023**: Cada tipo de luz com sombra DEVE ter caso de teste pelo caminho de autoria, parado e com a luz mudando a
  cada quadro, comparado com o estado parado.
- **FR-024**: A penumbra da luz de área DEVE ser comparada com uma referência de precisão dupla da fração visível da
  fonte.
- **FR-025**: Os testes de imagem que já existem e usam sombra (luz, céu, nuvens, névoa, materiais, luz rebatida,
  refração, superfícies paramétricas) DEVEM passar sem regressão.

### Key Entities

- **Luz com sombra**: uma luz da cena (direcional, de área, pontual, de foco) marcada para projetar; tem o seu ponto
  de vista, a sua penumbra e a sua parte do trabalho de sombra.
- **Sombra de uma luz**: o que, do ponto de vista dela, tapa cada ponto da cena; consultada para a visibilidade e para
  a espessura atravessada.
- **Orçamento de sombra**: o trabalho de sombra permitido por quadro, repartido entre as luzes com sombra.
- **Aviso de sombra**: a informação, para quem monta a cena, de que uma luz pediu sombra e não a tem.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Com três luzes direcionais com sombra, a imagem difere da soma das três imagens de uma luz só em no
  máximo 1 % da luz do chão iluminado, na média, e em no máximo 1 % dos pixels por mais de 25 %.
- **SC-002**: Com cada luz mudando a cada quadro, o último quadro difere do da cena parada no estado final em no
  máximo 0,05 % do chão iluminado, na média, e em no máximo 0,05 % dos pixels por mais de 25 % — para cada tipo de luz
  com sombra.
- **SC-003**: A luz de área que chega a um ponto parcialmente tapado difere da fração visível da fonte pela referência
  em no máximo 5 %, na média dos pontos medidos, e a largura da penumbra em no máximo 15 %.
- **SC-004**: No retrato sob uma caixa de luz, a luz das órbitas é no máximo 70 % da luz da testa, e o globo ocular
  fica mais escuro que a pele iluminada em volta.
- **SC-005**: Com a luz principal e a contraluz com sombra, a orelha na contraluz fica pelo menos duas vezes mais clara
  que sem a contraluz, e a diferença entre quadros seguidos com a câmera girando não tem salto acima de 1,5 vez a
  mediana.
- **SC-006**: Com mais luzes com sombra do que o teto, 100 % das luzes sem sombra são nomeadas num aviso, e nenhuma
  produz sombra.
- **SC-007**: Cada luz direcional com sombra a mais custa no máximo 1,5 ms de GPU por quadro (9 % do quadro de 60 Hz)
  no perfil alto, na cena de teste, no Apple M4, com as luzes paradas; e no máximo 3 ms com as luzes em movimento.
- **SC-008**: Uma luz de área com sombra custa no máximo 3 ms de GPU por quadro (18 % do quadro de 60 Hz) no perfil
  alto, na cena de teste, no Apple M4.
- **SC-009**: Uma cena com uma luz com sombra só custa no máximo 5 % a mais do que antes desta spec.
- **SC-010**: Os testes de imagem existentes que usam sombra passam sem mudar referência, salvo mudança explicada.

## Assumptions

- O teto de luzes com sombra simultâneas é uma decisão desta spec, com racional no plano; quatro direcionais no perfil
  alto é o mínimo, e o teto se ajusta ao adaptador.
- "Toda luz que pode projetar sombra" são os tipos que o motor já tem: direcional, de área (retângulo), pontual e de
  foco. A luz de hemisfério e a imagem do mundo não entram: a oclusão da luz do céu é da iluminação global.
- A sombra é calculada contra a geometria da cena a cada quadro; nada de oclusão pintada nem de tabela pré-calculada.
- Os critérios de tempo valem no Apple M4, em 1280 × 720, perfil alto; a RTX 4090 só é medida a pedido.
- Os limites dos critérios de tempo podem ser ajustados no plano, com racional, se a qualidade e o tempo real forem
  alcançados; uma sobra real de desempenho vai para a fila, sem manter a spec aberta.
- A sombra de volumes (névoa, nuvens) continua vindo da atenuação do meio, que já existe, e se multiplica à da
  geometria.
- Fora do escopo: a retomada do rosto da 011 (pele, lábios, olho, corpo mole), o custo da refração, as cáusticas e a
  luz rebatida de perto.
- As correções de sombra do pedido de integração #54 (a luz que gira, a espessura pelo nível de página) são a base.
- A validação no retrato usa as cenas do claflow-web (`pele-rosto-*`), em ramo próprio daquele repositório.
