# Feature Specification: Refração pela estrutura de raios e as falhas antigas

**Feature Branch**: `feature/034-ray-refraction-debts`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "Refração pela estrutura de raios e as falhas antigas (spec 034). Escopo: (1) débito R1
da 011 (specs/PENDENCIAS.md §5): o vidro hoje lê a cópia da cena na resolução da tela e, quando a refração amplia
(esfera como lente), aparecem pixels e degraus; a correção usa a estrutura de raios da 033 — o raio refratado acha a
superfície de trás e recalcula o material dela (nítido em qualquer ampliação), com leitura lisa da cópia (bicúbica, sem
blocos) onde ela basta e deslocamento pela profundidade da cena; vale para todos os dielétricos/transmissão da 011
(vidro, água) e para a água da 017/033. (2) Todas as falhas que já existiam no develop, registradas em PENDENCIAS H1,
H4, H5: H1 tempo de GPU por quadro no Apple — o profiler devolve a última leitura em todo quadro e os smokes contam a
mesma leitura várias vezes (sem filtrar por gpuFrame), mais os patamares de clock da GPU; corrigir a medição na C2 e
nos smokes (incluindo o desempenho do fluidSurface 19–23 ms > 16,7 ms) e reavaliar com a medida correta; H4 cáusticas
do lago em parametricSurfaces (63 px mais claros, pede 2 % da água; destravar a gravação da fixture de estado), pano do
softSurface que não aparece, xadrez e olho de peixe do extensionPoints, cor da caixa 181 do nodeGraphs; H5 cáusticas
agitadas do fluidSurface (1,29× contra ≥ 1,3×). Cada falha: achar a causa raiz e corrigir o motor (não afrouxar o
critério nem contornar a checagem), salvo se a investigação provar que o critério estava errado — então justificar com
medida. Requisitos gerais: Resource + evento + Flow, sem helpers; motor agnóstico (C3/C4 importam só a C2); cada
símbolo WGSL definido uma vez; sem leitura de volta por quadro; trajetórias físicas bit a bit; os 31 smokes passando
sem exceção no fonte e com --dist; medidas de nitidez da refração (ampliação sem degraus, comparação com referência
recalculada na CPU); bench sem regressão relevante e baseline; npm run ci verde; vídeos para o usuário."

## Contexto e Problema

A 033 entregou a estrutura de raios na GPU, mas a refração ainda é a da 011, e a bateria de smokes carrega falhas que
já existiam no `develop` antes da 033:

| Lacuna                               | Estado atual                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refração pixelada (R1)               | O vidro e a água leem a cópia da cena na resolução da tela; numa esfera que amplia como lente, o fundo aparece em blocos e as bordas em degraus                   |
| Refração sem o que está fora da tela | O que o raio refratado deveria ver mas está atrás do próprio vidro, encoberto ou fora do quadro não existe na cópia: a refração mostra o vidro ou a borda da tela |
| Tempo de GPU duvidoso (H1)           | O tempo por quadro repete a última leitura até chegar outra; os smokes contam a mesma leitura várias vezes; no Apple o clock da GPU oscila em patamares           |
| Cáusticas do lago (H4)               | Só 63 pixels mais claros na água do lago (o critério pede 2 % da água); sem isso a fixture de estado do `parametricSurfaces` não é gravada                        |
| Pano do `softSurface` (H4)           | O pano XPBD não aparece na imagem (a checagem da sombra falha)                                                                                                    |
| `extensionPoints` (H4)               | O xadrez por `material` e o olho de peixe por `camera` falham nas suas checagens                                                                                  |
| `nodeGraphs` (H4)                    | A cor da caixa 181 não confere com a esperada                                                                                                                     |
| Cáusticas agitadas (H5)              | A água agitada do `fluidSurface` mostra regiões claras 1,29× (o critério pede ≥ 1,3×)                                                                             |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Refração nítida em qualquer ampliação (Priority: P1)

Quem coloca um vidro, uma lente, um copo d'água ou a água de partículas numa cena vê através deles uma imagem lisa e
correta: uma esfera de vidro na frente de um tabuleiro mostra o tabuleiro invertido e ampliado sem blocos nem degraus,
por mais que se aproxime a câmera; o que está atrás do vidro aparece mesmo quando está fora da tela ou encoberto pelo
próprio vidro.

**Why this priority**: é o débito imediato R1, pedido pelo usuário ("imagem lisa") e o critério da F4 de ficar acima do
Three.js em refração.

**Independent Test**: uma esfera de vidro maciça sobre um tabuleiro de alto contraste, câmera aproximando até a esfera
cobrir a tela; a imagem refratada é comparada à referência recalculada na CPU e medida quanto a degraus nas bordas das
casas.

**Acceptance Scenarios**:

1. **Given** uma esfera de vidro (IOR 1,5) diante de um tabuleiro, **When** a câmera aproxima até a ampliação local da
   refração passar de 8×, **Then** as bordas das casas vistas pelo vidro são linhas contínuas, sem degraus de pixel da
   cópia da tela, e a cor de cada região fica perto da referência da CPU.
2. **Given** um objeto atrás do vidro que fica fora do quadro ou encoberto, **When** o raio refratado o atinge, **Then**
   ele aparece na refração (cor do material dele, não a do vidro nem a da borda da tela).
3. **Given** um material dielétrico da 011 com absorção, dispersão, parede fina ou rugosidade, **When** desenhado,
   **Then** a refração recalculada respeita o modelo (cor da absorção pela distância percorrida, dispersão por canal,
   parede fina sem desvio, desfoque pela rugosidade) sem voltar a mostrar blocos.
4. **Given** a água de partículas da 017/033 e o material da água, **When** a câmera olha através da superfície,
   **Then** o fundo é visto pela mesma refração recalculada, com absorção pela profundidade, nítido e sem degraus.
5. **Given** uma cena sem nenhum material com transmissão, **When** desenhada, **Then** nada da refração roda e o custo
   do quadro não muda.

---

### User Story 2 - Tempo de GPU em que se pode confiar (Priority: P1)

Quem mede o motor — os smokes, o bench, um usuário olhando o tempo do quadro — recebe o tempo de GPU de cada quadro
medido uma vez, sabendo de qual quadro ele é, sem repetir leituras antigas e sem ser enganado pelo clock variável da
GPU.

**Why this priority**: sem medida confiável não dá para saber se o desempenho do `fluidSurface` falha de verdade, nem
validar o orçamento da refração nova.

**Independent Test**: uma cena com custo de GPU conhecido (trabalho repetido N vezes) medida pelo tempo de GPU por
quadro e pelo relógio de parede com repetição; as duas medidas concordam e as amostras não se repetem.

**Acceptance Scenarios**:

1. **Given** o profiling por quadro ligado, **When** os quadros são lidos, **Then** cada leitura traz o quadro a que
   pertence e um consumidor consegue contar cada quadro medido uma única vez.
2. **Given** uma cena cujo trabalho de GPU dobra, **When** medida, **Then** o tempo de GPU por quadro dobra (dentro da
   tolerância), em vez de ficar num patamar.
3. **Given** o smoke de desempenho do `fluidSurface`, **When** medido com a leitura corrigida, **Then** o resultado
   reflete o custo real e o critério de 16,7 ms é avaliado sobre ele; se a cena passar do orçamento com a medida
   correta, o custo é reduzido no motor.

---

### User Story 3 - Cáusticas visíveis no lago e na água agitada (Priority: P1)

Quem solta água num vale ou agita um tanque vê no fundo as manchas de luz concentrada (cáusticas) com o contraste
esperado, e o estado do lago pode ser gravado como fixture.

**Why this priority**: as cáusticas são parte do material da água da 017 e da 033; as duas falhas impedem a bateria de
passar e a fixture de estado do lago de existir.

**Independent Test**: o caso do lago do `parametricSurfaces` e o caso agitado do `fluidSurface`, cada um comparando a
mesma água com e sem cáusticas.

**Acceptance Scenarios**:

1. **Given** o lago no vale do `parametricSurfaces`, **When** desenhado, **Then** pelo menos 2 % dos pixels da água ficam
   mais claros que a mesma água sem cáusticas, e a fixture de estado é gravada.
2. **Given** a água agitada do `fluidSurface`, **When** desenhada, **Then** as regiões claras das cáusticas ficam ≥ 1,3×
   o fundo sem cáusticas.

---

### User Story 4 - Os smokes visuais antigos voltam a passar (Priority: P2)

Quem roda a bateria vê o pano do `softSurface`, o xadrez e o olho de peixe do `extensionPoints` e a caixa 181 do
`nodeGraphs` como os smokes esperam.

**Why this priority**: são falhas antigas que escondem regressões novas; cada uma tem de ser entendida até a causa.

**Independent Test**: cada smoke isolado, no fonte e com `--dist`.

**Acceptance Scenarios**:

1. **Given** a cena do pano XPBD do `softSurface`, **When** desenhada, **Then** o pano aparece e projeta a sombra
   esperada.
2. **Given** o material xadrez por uv do `extensionPoints`, **When** desenhado, **Then** as casas alternam claro e
   escuro com as trocas esperadas na linha medida.
3. **Given** a câmera com projeção olho de peixe do `extensionPoints`, **When** desenhada, **Then** a imagem segue a
   projeção declarada.
4. **Given** a caixa 181 do `nodeGraphs`, **When** desenhada, **Then** a cor confere com a do grafo.

---

### User Story 5 - Bateria inteira verde e entrega fechada (Priority: P2)

Quem integra a entrega encontra os 31 smokes passando sem exceção no fonte e com `--dist`, o bench sem regressão com
baseline regravado, a documentação da refração atualizada, as pendências H1, H4, H5 e R1 baixadas e os vídeos
gravados.

**Why this priority**: fecha a fila de falhas herdadas antes de seguir a F4.

**Independent Test**: a bateria completa, o bench e o `npm run ci`.

**Acceptance Scenarios**:

1. **Given** a branch pronta, **When** a bateria roda no fonte e com `--dist`, **Then** os 31 smokes passam.
2. **Given** o bench, **When** comparado ao baseline atual, **Then** nenhuma cena regride de forma relevante.

---

### Edge Cases

- Raio refratado que sai da cena sem acertar nada: vê o céu/ambiente na direção refratada.
- Reflexão interna total dentro do vidro: o raio segue refletido dentro do objeto até sair ou até o limite de
  rebatimentos, sem buraco preto.
- Vidro dentro de vidro, ou água vista por um copo: as interfaces encadeiam até o limite de profundidade, e no limite
  usam a leitura lisa da cópia.
- Superfície de trás com material que lê derivadas de tela (H6): vale pelas constantes, como nos acertos da GI.
- Objetos que se movem ou deformam (corpos moles, partículas): a refração os acompanha no mesmo quadro.
- Leituras do tempo de GPU que não chegam (dispositivo sem timestamp, quadros pulados): a ausência fica explícita, sem
  repetir o valor anterior como se fosse novo.
- Critério de smoke que a investigação prova errado: a correção do critério vem com a medida que o justifica, registrada.

## Requirements _(mandatory)_

### Functional Requirements

**Refração (R1)**

- **FR-001**: A transmissão dos materiais dielétricos (vidro, água e todo material com transmissão da 011) MUST seguir o
  raio refratado pela estrutura de raios da cena e calcular o material da superfície atingida, em vez de amostrar a
  cópia da tela.
- **FR-002**: O raio refratado MUST encadear as interfaces (entrada e saída do objeto, reflexão interna total) até um
  limite configurável de profundidade; no limite, ou quando a leitura da cópia basta, MUST usar uma leitura lisa da
  cópia (sem blocos), deslocada pela profundidade da cena.
- **FR-003**: A refração MUST manter o modelo da 011: absorção pela distância percorrida, dispersão por canal, parede
  fina, rugosidade, Fresnel e a mistura com o reflexo.
- **FR-003a**: A imagem refratada MUST não serrilhar: onde ela muda de um pixel para o vizinho (bordas vistas pelo
  vidro, padrões finos reduzidos pela lente) o pixel recebe amostras extras dentro dele, cada uma com a sua luz; a opção
  `antialias` da `Refraction` desliga (padrão ligada). _Acrescentado na implementação (2026-10-18), a pedido do
  usuário: nenhum serrilhado na entrega._
- **FR-004**: A superfície atingida pelo raio refratado MUST receber a mesma iluminação da cena (luz direta, sombras,
  GI e céu) que receberia vista diretamente.
- **FR-005**: A água de partículas da 017/033 e o material da água MUST usar a mesma refração.
- **FR-006**: Cenas sem material com transmissão MUST não pagar nenhum custo da refração.
- **FR-007**: A refração MUST entrar pelos pontos de cena existentes (materiais, nós e desenho inalterados para quem
  monta a cena).

**Medição do tempo de GPU (H1)**

- **FR-008**: Cada leitura do tempo de GPU por quadro MUST identificar o quadro medido e ser entregue como nova uma única
  vez; quadros sem leitura MUST ficar sem valor em vez de repetir o anterior.
- **FR-009**: Os smokes e o bench que usam o tempo de GPU MUST contar cada quadro medido uma vez e medir com a GPU em
  regime (aquecida), com um método que não dependa do patamar de clock.
- **FR-009a**: A correção da medição MUST ser multiplataforma: nada específico do Apple/Metal no motor, nos smokes ou no
  bench; o mesmo código MUST valer em Metal (Apple), D3D12 e Vulkan (ex.: NVIDIA RTX 4090) e em dispositivos sem
  `timestamp-query`. Tolerâncias e orçamentos não MUST ser calibrados para um único hardware.
- **FR-010**: O desempenho do `fluidSurface` MUST ser reavaliado com a medida corrigida; se exceder o orçamento, o custo
  MUST ser reduzido no motor.

**Falhas herdadas (H4, H5)**

- **FR-011**: As cáusticas do lago do `parametricSurfaces` MUST atingir o critério, e a fixture de estado MUST ser
  gravada.
- **FR-012**: As cáusticas agitadas do `fluidSurface` MUST atingir o critério de ≥ 1,3×.
- **FR-013**: O pano do `softSurface`, o xadrez e o olho de peixe do `extensionPoints` e a caixa 181 do `nodeGraphs` MUST
  passar nas suas checagens.
- **FR-014**: Cada falha MUST ter a causa raiz identificada e registrada, e a correção MUST ser feita no motor; um
  critério só MUST mudar se a investigação provar, com medida registrada, que ele estava errado.

**Gerais**

- **FR-015**: Tudo MUST seguir Resource + evento + Flow, sem helpers; C3/C4 importam só a C2; cada símbolo WGSL definido
  uma vez; sem leitura de volta por quadro; trajetórias físicas bit a bit.
- **FR-016**: Os 31 smokes MUST passar sem exceção no fonte e com `--dist`; `npm run ci` MUST ficar verde; o bench MUST
  ficar sem regressão relevante, com baseline regravado.
- **FR-017**: A documentação da refração e dos pontos de cena MUST ser atualizada, as pendências R1, H1, H4 e H5 MUST
  ser baixadas em `specs/PENDENCIAS.md`, e os vídeos dos smokes visuais MUST ser gravados e enviados.

### Key Entities

- **Material com transmissão**: o dielétrico da 011 (IOR, absorção, dispersão, parede fina, rugosidade) que agora
  segue o raio refratado.
- **Limite de refração**: a profundidade de interfaces seguidas antes de cair na leitura lisa da cópia.
- **Leitura de tempo de GPU**: o tempo de um quadro, com o índice do quadro a que pertence e a marca de nova.

## Success Criteria _(mandatory)_

### Princípio dos limiares (pedido do usuário, 2026-10-18)

Os limiares servem a simulações de física e engenharia e a jogos, em dois eixos separados:

- **Exatidão** (independe do hardware; vale sempre): a imagem e a física comparadas a uma referência — analítica ou
  recalculada na CPU — com erro em porcentagem da referência; trajetórias físicas bit a bit entre execuções, no fonte e
  com `--dist`. Nenhuma otimização (adaptativa ou não) troca exatidão por tempo: ela reproduz o resultado completo
  dentro do limiar de exatidão, medido.
- **Tempo** (o perfil tempo real, jogos e visualização interativa): orçamento do quadro a 60 Hz (16,7 ms) e o custo de
  cada recurso como fração dele, no hardware de referência declarado — o piso é o Apple M4 (integrado); a RTX 4090
  passa pelos mesmos limites com folga. Nada de número calibrado à medida de uma máquina: o limite vem da fração do
  orçamento, e a medida só o confirma. Fora do perfil tempo real (engenharia, offline), os parâmetros de qualidade
  podem subir e o quadro passar do orçamento; os limiares de exatidão continuam valendo.

### Measurable Outcomes

- **SC-001**: Com a esfera de vidro ampliando ≥ 8× o tabuleiro, nenhuma borda de casa vista pelo vidro mostra degraus:
  o maior salto de cor entre pixels vizinhos ao longo da borda não passa de 1,2× o da mesma borda vista sem vidro.
- **SC-002**: A cor média de cada região da imagem refratada fica a ≤ 5 % da referência recalculada na CPU, nas cenas da
  esfera, do bloco de vidro com absorção e do copo d'água.
- **SC-003**: Objetos fora do quadro ou encobertos aparecem na refração em 100 % dos casos medidos (cor do objeto, não
  do vidro nem da borda).
- **SC-004**: A refração, com o vidro cobrindo um quarto da tela a 1280×720 (um cômodo iluminado atrás dele), custa
  ≤ 15 % do orçamento do quadro a 60 Hz (≤ 2,5 ms) no hardware de referência, com o antisserrilhado da imagem refratada
  e a dispersão; sem transmissão na cena, o custo do quadro não muda (dentro do ruído). _Revisto (2026-10-18)_: o limite
  é a fração do orçamento (princípio dos limiares), não a medida de uma máquina.
- **SC-005**: O tempo de GPU por quadro e a medida por repetição no relógio de parede concordam a ≤ 15 % numa cena de
  custo conhecido; nenhuma amostra repetida entra nas médias.
- **SC-006**: Os 31 smokes passam no fonte e com `--dist`, sem exceção; as checagens H4 e H5 passam com os critérios
  originais (ou com critério corrigido justificado por medida registrada).
- **SC-007**: O bench não regride mais que o ruído em nenhuma cena; o baseline é regravado.
- **SC-008**: `npm run ci` verde e os vídeos dos smokes visuais enviados ao usuário.

## Assumptions

- A estrutura de raios da 033 (malhas, superfícies, grafos, corpos moles, esferas das partículas, volumes) é a base da
  refração; nada novo de estrutura é necessário além do que a refração pedir.
- O limite padrão de interfaces seguidas é pequeno (algumas interfaces); cenas com muitos vidros encadeados caem na
  leitura lisa da cópia no limite.
- As texturas por derivada nas superfícies atingidas pelo raio (H6) continuam pela 012; aqui valem as constantes, como
  nos acertos da GI.
- O desenvolvimento roda num Mac (Apple M4, Metal); o usuário valida também numa NVIDIA RTX 4090. Os baselines do bench
  são por máquina (o nome do arquivo identifica o hardware), e os critérios dos smokes valem nas duas.
- A medida corrigida do tempo de GPU pode mostrar que o `fluidSurface` cabe no orçamento; nesse caso basta a medida.
- As falhas H4/H5 são do motor até prova em contrário; a referência de comparação é o `develop` atual (com a 033).
