# Feature Specification: Nuvens volumétricas

**Feature Branch**: `feature/041-nuvens-volumetricas`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "o que falta para termos implementação de nuvens volumétricas?" (2026-11-17) e, após o
levantamento, "Sim" para escrever a spec. Escopo levantado: camada de nuvens em altitude por marcha de raio própria;
modelo de densidade (cobertura, altura por tipo, forma por ruído, erosão de borda, vento); luz da nuvem (autossombra,
múltiplo espalhamento, fase de dois lobos, escurecimento de borda); integração com sombra no chão, céu, iluminação global,
refração, reflexo e névoa; validação contra referência e limite de tempo no Apple M4.

## Contexto e Problema

O motor já tem o céu físico (atmosfera de Hillaire, spec 033), a névoa como meio participante (`FogVolume` sobre uma
grade de froxels presa à câmera, 160 × 90 × 128 no perfil alto, fatias exponenciais), ruídos Perlin, Worley e fBm nos
grafos de nós e o canal temporal da spec 037. Não tem nuvens: o céu é limpo e a névoa só cobre a vizinhança da câmera.

A grade de froxels não serve a nuvens: as fatias finais têm centenas de metros de espessura e a grade acaba a algumas
centenas de metros; uma camada de 1,5–4 km de altitude vista a dezenas de quilômetros precisa de amostragem própria. O
espalhamento da névoa é simples e de um lobo, o que deixa uma nuvem densa cinza e chapada em vez de branca e macia.

Referências da indústria e da física: Schneider & Vos, "The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn"
(SIGGRAPH 2015); Hillaire, "Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite" (2016); Wrenninge et al.,
"Oz: The Great and Volumetric" (2013, múltiplo espalhamento por oitavas); Bouthors et al. 2008 (luz em nuvens); Bruneton
& Neyret (atmosfera); Unreal Engine Volumetric Clouds; Novák et al. 2018 (transporte em meios participantes).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Céu com nuvens físicas (Priority: P1)

Quem monta uma cena ao ar livre liga uma camada de nuvens e vê, no céu, nuvens com volume: bordas iluminadas pelo sol,
interior escuro onde a luz não chega, base cinza e topo brilhante, brilho prateado contra o sol, nuvens distantes
esmaecidas pela atmosfera até o horizonte. A câmera pode estar no chão, entre as nuvens ou acima delas.

**Why this priority**: é o pedido; sem a camada desenhada pela física nada mais da spec tem o que mostrar.

**Independent Test**: uma cena só com céu e a camada de nuvens, câmera no chão olhando o horizonte e para cima, ao meio
dia e ao pôr do sol; a imagem é comparada à referência de alta precisão e gravada em vídeo.

**Acceptance Scenarios**:

1. **Given** uma camada de nuvens com cobertura parcial, **When** a câmera olha o céu, **Then** cada pixel de nuvem
   tem a transmitância e a radiância da referência dentro da tolerância, e o céu entre as nuvens continua igual ao céu
   limpo.
2. **Given** o sol atrás de uma nuvem, **When** a câmera olha contra o sol, **Then** a borda da nuvem brilha mais do
   que o centro (espalhamento para a frente) e o centro escurece pela espessura.
3. **Given** a câmera subindo do chão até acima da camada, **When** atravessa a nuvem, **Then** a imagem passa de
   céu com nuvens a névoa densa a mar de nuvens visto de cima, sem salto, sem corte e sem faixa.
4. **Given** nuvens a 30 km, **When** vistas no horizonte, **Then** ficam esmaecidas e azuladas pela atmosfera entre
   elas e a câmera, como na referência.

---

### User Story 2 - Forma e tipo das nuvens controlados pela cena (Priority: P1)

Quem monta a cena escolhe a cobertura (do céu limpo ao encoberto), o tipo (cúmulos, estratos, um misto) e a altura
da camada, desenha onde há nuvens por um mapa de cobertura ou um grafo de nós, e define o vento. As nuvens têm forma
de couve-flor nos cúmulos, camadas lisas nos estratos, bordas desfiadas, e se deslocam e se deformam com o vento.

**Why this priority**: sem controle de forma, o resultado é um padrão de ruído uniforme, não um céu.

**Independent Test**: a mesma cena com três configurações (céu limpo, cúmulos esparsos, encoberto de estratos) e com
vento; a cobertura medida na imagem segue o valor pedido e as nuvens se movem na direção e velocidade do vento.

**Acceptance Scenarios**:

1. **Given** cobertura 0, **When** a cena é desenhada, **Then** o céu é idêntico ao céu limpo.
2. **Given** cobertura 1 com estratos, **When** vista de baixo, **Then** o céu fica encoberto, sem buracos.
3. **Given** um mapa de cobertura com uma região vazia, **When** a câmera olha essa região, **Then** não há nuvem ali.
4. **Given** vento de 10 m/s para leste, **When** o tempo passa 10 s, **Then** as nuvens se deslocam 100 m para leste
   (medido pela correlação da densidade) e mudam de forma aos poucos.
5. **Given** um grafo de nós escrito pelo usuário para a densidade, **When** ligado à camada, **Then** a forma segue o
   grafo, avaliado na GPU.

---

### User Story 3 - As nuvens iluminam e sombreiam a cena (Priority: P2)

As nuvens fazem sombra no chão, na água e nos objetos, e a sombra se move com elas. O céu que ilumina a cena (a luz
ambiente e a iluminação global) fica mais escuro e mais neutro com o céu encoberto. O vidro e a água refletem e
refratam as nuvens. A névoa perto da câmera e as nuvens distantes se compõem na ordem certa de profundidade.

**Why this priority**: uma nuvem que não sombreia nem muda a luz da cena é um fundo pintado, não física.

**Independent Test**: um terreno com água e uma esfera de vidro sob nuvens esparsas; a sombra no chão segue a
transmitância das nuvens até o sol; a luz ambiente medida cai com a cobertura; o reflexo na água mostra as nuvens.

**Acceptance Scenarios**:

1. **Given** uma nuvem entre o sol e um ponto do chão, **When** a cena é desenhada, **Then** a luz direta no ponto é
   multiplicada pela transmitância da nuvem até o sol (dentro da tolerância da referência) e a borda da sombra é suave.
2. **Given** céu encoberto, **When** comparado ao céu limpo, **Then** a luz ambiente e a iluminação global da cena caem
   na proporção da referência, e o sol direto praticamente some.
3. **Given** água calma e nuvens no céu, **When** a câmera olha a água, **Then** o reflexo mostra as nuvens.
4. **Given** névoa perto da câmera e nuvens ao longe, **When** a cena é desenhada, **Then** a névoa fica na frente das
   nuvens e as atenua, sem halo nem borda dupla.

---

### User Story 4 - Rápido o bastante para tempo real (Priority: P2)

A camada de nuvens cabe no orçamento de um jogo: no Apple M4, no perfil alto, as nuvens custam uma fração pequena do
quadro de 60 Hz, ficam estáveis com a câmera e as nuvens em movimento (sem cintilação nem rastro), e o custo é
adaptado pelo perfil de qualidade e pelo que a GPU mede.

**Why this priority**: nuvens volumétricas que derrubam a taxa de quadros não são usáveis num motor de tempo real.

**Independent Test**: a cena da US1 no bench, medindo o tempo de GPU do estágio das nuvens por perfil, e a cintilação
por pixel com a câmera girando.

**Acceptance Scenarios**:

1. **Given** o perfil alto no M4 a 1280 × 720, **When** medido, **Then** o estágio das nuvens custa até 3 ms.
2. **Given** câmera girando e vento, **When** a imagem é medida quadro a quadro, **Then** não há cintilação nem rastro
   acima dos limites do smoke de antisserrilhado.
3. **Given** o perfil baixo, **When** medido, **Then** o custo cai e a imagem continua sem faixas nem blocos.

### Edge Cases

- Câmera dentro da nuvem (névoa densa) e acima da camada: nenhum corte, nenhum salto na transição.
- Sol abaixo do horizonte: nuvens iluminadas pelo céu e pelo crepúsculo, sem preto absoluto nem luz que atravesse o
  planeta.
- Cobertura 0 e 1, camada de espessura zero, vento zero e muito forte.
- Nuvem atrás de uma montanha ou de um objeto: a geometria opaca recorta a nuvem pela profundidade, sem halo.
- Lua ou mais de uma luz direcional: cada luz que ilumina a cena ilumina as nuvens.
- Cena interna sem céu visível: o estágio das nuvens não gasta tempo de GPU.
- GPU com limites menores (perfil de dispositivo mínimo): as nuvens abrem e funcionam com qualidade menor, sem erro.
- Corte de câmera: o histórico é recomeçado sem rastro do quadro anterior.

## Requirements _(mandatory)_

### Functional Requirements

**Camada e desenho**

- **FR-001**: O motor MUST oferecer uma camada de nuvens como recurso de cena, entre duas altitudes sobre o planeta da
  atmosfera física, visível do chão, de dentro e de cima, até a distância do horizonte.
- **FR-002**: As nuvens MUST ser desenhadas pela transferência radiativa no meio (extinção, espalhamento e transmitância
  ao longo do raio da câmera), nunca por imagem, céu pintado ou textura de nuvem pronta.
- **FR-003**: O desenho MUST ter custo limitado por pixel: número máximo de amostras constante, passo que cresce com a
  distância, parada antecipada quando a transmitância fica desprezível, resolução reduzida reconstruída na resolução da
  tela.
- **FR-004**: A acumulação entre quadros MUST usar o canal temporal da spec 037 e rejeitar o histórico onde a nuvem ou
  a câmera mudaram, sem rastro e sem cintilação acima dos limites do antisserrilhado.

**Densidade e forma**

- **FR-005**: A densidade MUST combinar cobertura em grande escala (valor global, mapa de cobertura ou grafo de nós),
  perfil de altura por tipo de nuvem (cúmulo, estrato, misto, contínuo entre eles) e forma por ruído em três escalas
  (forma, detalhe e erosão das bordas).
- **FR-006**: Os ruídos de forma MUST ser preparados na GPU, a partir dos nós de ruído existentes, como alvo calculado;
  nada é calculado na CPU.
- **FR-007**: O vento MUST deslocar e deformar as nuvens ao longo do tempo, com direção e velocidade da cena, e o
  deslocamento MUST ser contínuo (sem salto ao reiniciar ciclos de ruído).
- **FR-008**: O usuário MUST poder substituir ou modular a densidade por um grafo de nós, no mesmo ponto de extensão da
  densidade da névoa.

**Luz**

- **FR-009**: Cada ponto da nuvem MUST receber a luz de cada luz direcional atenuada pela própria nuvem até a luz
  (autossombra) e pela atmosfera (transmitância do céu).
- **FR-010**: O espalhamento MUST representar o espalhamento múltiplo dentro da nuvem (que a torna branca e macia) e o
  espalhamento para a frente e para trás das gotículas (fase de dois lobos), validado contra a referência.
- **FR-011**: As nuvens MUST receber a luz do céu (ambiente) e do chão, coerente com o céu físico.
- **FR-012**: A atmosfera entre a nuvem e a câmera MUST atenuar e tingir a nuvem (perspectiva aérea).

**Integração**

- **FR-013**: As nuvens MUST fazer sombra em tudo o que recebe a luz direcional (chão, água, objetos, névoa), pela
  transmitância até o sol, com borda suave e movimento com as nuvens.
- **FR-014**: A luz ambiente do céu e a iluminação global MUST incluir as nuvens.
- **FR-015**: Os raios da refração e do reflexo que saem para o céu MUST ver as nuvens.
- **FR-016**: Névoa e nuvens MUST se compor pela profundidade (a névoa na frente atenua a nuvem; a geometria opaca
  recorta a nuvem).
- **FR-017**: Uma cena sem céu visível nem sombra de nuvem MUST não pagar o custo do estágio.

**Validação e entrega**

- **FR-018**: MUST existir uma referência de alta precisão da transferência radiativa da nuvem (transmitância, luz com
  autossombra e espalhamento múltiplo), com testes, separada do código de produção.
- **FR-019**: MUST existir teste visual montado pelo caminho de autoria que compare a imagem do motor à referência
  (transmitância, brilho de borda contra o sol, cobertura) e meça cintilação, rastro e tempo de GPU.
- **FR-020**: O motor MUST se adaptar aos limites da GPU (perfis de qualidade e limites medidos), sem nada específico de
  fabricante ou sistema.
- **FR-021**: MUST haver cenas de demonstração no app clayflow-web (céu ao meio dia, pôr do sol, voo através das nuvens,
  sombras de nuvens sobre terreno e água) gravadas em vídeo.

### Key Entities

- **Camada de nuvens**: altitudes da base e do topo, cobertura, tipo, densidade, albedo, vento; pertence ao céu da cena.
- **Mapa de cobertura**: onde há nuvens em grande escala (valor, imagem ou grafo de nós), deslocado pelo vento.
- **Volumes de ruído**: forma e detalhe preparados na GPU a partir dos nós de ruído; recalculados só quando mudam.
- **Mapa de transmitância visto do sol**: a fração da luz direcional que atravessa as nuvens, lida por quem recebe a
  luz do sol.
- **Histórico das nuvens**: a imagem acumulada entre quadros, pelo canal temporal da 037.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Transmitância e radiância das nuvens dentro de 5 % da referência de alta precisão nas cenas de teste
  (média por região), e o céu sem nuvens idêntico ao céu limpo.
- **SC-002**: Brilho de borda contra o sol: a razão entre borda e centro de uma nuvem iluminada por trás fica dentro de
  10 % da referência.
- **SC-003**: Cobertura medida na imagem dentro de 5 pontos percentuais da cobertura pedida.
- **SC-004**: Sombra no chão: a luz direta sob a nuvem dentro de 5 % da transmitância de referência até o sol.
- **SC-005**: Custo do estágio das nuvens no Apple M4, 1280 × 720, perfil alto: até 3 ms por quadro (18 % do quadro de
  60 Hz); perfil médio até 2 ms; cena sem céu: custo desprezível (abaixo de 0,05 ms).
- **SC-006**: Cintilação e rastro com câmera e vento em movimento dentro dos limites do smoke de antisserrilhado.
- **SC-007**: Nenhuma regressão: todos os smokes passam 3 vezes seguidas pelo código-fonte e com o pacote montado; o
  bench não piora mais de 10 % em GPU em nenhuma cena existente.
- **SC-008**: Vídeos de demonstração gravados e enviados ao usuário, sem faixas, blocos ou cortes visíveis.

## Assumptions

- A atmosfera física, o canal temporal da 037, o mapa de sombra virtual, a iluminação global e a refração da 034 estão
  no develop e são a base; a 041 os estende, não os substitui.
- Um planeta e uma camada de nuvens por cena; várias camadas sobrepostas e nuvens de outros planetas ficam para depois.
- O Apple M4 é o piso de desempenho; a RTX 4090 só confirma que nada é específico do Mac.
- Unidades físicas: altitudes em metros/quilômetros, extinção em 1/m, vento em m/s.
- Fora do escopo: o custo da refração da 034 (32 ms na lente, 81 ms na água funda no perfil alto), tratado em paralelo;
  chuva e precipitação; raios e relâmpagos; simulação de dinâmica de fluidos das nuvens (formação, convecção).
- Políticas do projeto valem integralmente: Resource + evento + Flow, sem helpers, sem alocação de GPU em Flow, nada
  na CPU, laços de GPU com teto constante, produção sem importar as referências, multiplataforma, AAA sem falsear.
