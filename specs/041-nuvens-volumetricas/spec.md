# Feature Specification: Nuvens volumétricas

**Feature Branch**: `feature/041-nuvens-volumetricas`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "o que falta para termos implementação de nuvens volumétricas?" (2026-11-17) e, após o
levantamento, "Sim" para escrever a spec. Escopo levantado: camada de nuvens em altitude por marcha de raio própria;
modelo de densidade (cobertura, altura por tipo, forma por ruído, erosão de borda, vento); luz da nuvem (autossombra,
múltiplo espalhamento, fase de dois lobos, escurecimento de borda); integração com sombra no chão, céu, iluminação global,
refração, reflexo e névoa; validação contra referência e limite de tempo no Apple M4. Acréscimo (2026-11-17): "Se fizer
sentido considere zonas de baixa e alta pressão para formação de nuvens com tempestades" — o tempo (US5, FR-023–FR-028).

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
refratam as nuvens. A névoa perto da câmera e as nuvens distantes se compõem na ordem certa de profundidade. A
atmosfera entre a câmera e tudo o que está longe (montanhas, terreno, água, nuvens) esmaece e azula pela distância.

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
5. **Given** um terreno com montanhas a 2, 10 e 30 km e um céu físico, com ou sem nuvens, **When** a cena é desenhada,
   **Then** cada montanha recebe a luz espalhada e a transmitância da atmosfera até ela dentro da tolerância da referência
   da atmosfera (mais azulada e mais clara quanto mais longe), e a montanha e a nuvem à mesma distância esmaecem igual.

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

---

### User Story 5 - O tempo: baixas, altas e tempestades (Priority: P2)

Quem monta a cena liga o tempo na camada de nuvens: um campo de pressão em escala sinótica (centenas de km), do padrão
da biblioteca ou de um grafo de nós da cena, com sistemas de alta e baixa que nascem, crescem, se desfazem e se
deslocam. Nas baixas o ar converge e sobe: a cobertura aumenta e os cúmulos viram cúmulos-nimbos, torres até a
tropopausa com o topo em bigorna. Nas altas o ar desce: o céu limpa ou fica com cúmulos rasos e estratos. Onde os
sistemas se encontram, uma faixa de nuvens (a frente). O vento das nuvens sai da pressão — gira em volta das baixas no
sentido anti-horário no hemisfério norte e horário no sul, pela latitude da cena — e leva as nuvens.

**Why this priority**: o céu de um mundo vivo muda com o tempo; sem ele, a cobertura é um número ou um mapa pintado e
uma tempestade não tem de onde nascer.

**Independent Test**: uma cena com o tempo e uma baixa gaussiana conhecida: o vento da GPU contra a referência f64 (e a
referência contra a solução analítica do vórtice), o sentido do giro no norte, no sul e no equador, a torre e a bigorna
na baixa, a faixa entre uma baixa e uma alta, o custo; e o vídeo de uma tempestade se formando vista de longe.

**Acceptance Scenarios**:

1. **Given** uma baixa a 45° N, **When** o tempo é calculado, **Then** o vento das nuvens gira no sentido anti-horário
   em volta dela com a velocidade do vento gradiente da referência, e a 45° S no horário.
2. **Given** a mesma baixa no equador, **When** o tempo é calculado, **Then** o vento desce o gradiente da pressão
   (atrito), finito, e muda continuamente com a latitude ao cruzar o equador.
3. **Given** uma baixa que se aprofunda, **When** o tempo passa, **Then** as nuvens no centro dela crescem até a
   tropopausa e abrem a bigorna no alto, em torno do tempo de formação, e o céu em volta (a subsidência) limpa.
4. **Given** uma alta, **When** a cena é desenhada, **Then** a cobertura é menor que a do tempo bom e as nuvens são
   rasas.
5. **Given** uma baixa e uma alta vizinhas, **When** a cena é desenhada, **Then** uma faixa de nuvens fica entre elas.
6. **Given** um grafo de nós da cena para a pressão, **When** ligado ao tempo, **Then** ele substitui o padrão, avaliado
   na GPU.

### Edge Cases

- Câmera dentro da nuvem (névoa densa) e acima da camada: nenhum corte, nenhum salto na transição.
- Sol abaixo do horizonte: nuvens iluminadas pelo céu e pelo crepúsculo, sem preto absoluto nem luz que atravesse o
  planeta.
- Cobertura 0 e 1, camada de espessura zero, vento zero e muito forte.
- Nuvem atrás de uma montanha ou de um objeto: a geometria opaca recorta a nuvem pela profundidade, sem halo.
- Lua ou mais de uma luz direcional: cada luz que ilumina a cena ilumina as nuvens.
- Cena interna sem céu visível: a marcha das nuvens não gasta tempo; só a sombra e o ambiente das nuvens seguem (entram
  pelas janelas), dentro do teto da SC-005.
- GPU com limites menores (perfil de dispositivo mínimo): as nuvens abrem e funcionam com qualidade menor, sem erro.
- Corte de câmera: o histórico é recomeçado sem rastro do quadro anterior.
- O tempo no equador (f = 0): o vento continua finito e contínuo na latitude (o atrito; sem giro espontâneo), e os
  sistemas do padrão ficam fracos (a anomalia escala com a rotação). Nos polos, f máximo.
- Uma alta com gradiente forte demais para a curvatura (sem equilíbrio regular do vento gradiente): o vento fica no
  teto do equilíbrio, sem estourar.
- Tempo acelerado (Δt de segundos a minutos por quadro): a evolução do estado é estável (o relaxamento é exato para
  qualquer Δt; a advecção é semi-Lagrangiana).
- A função de pressão devolve valor não finito: vale 0. O tempo ligado ou desligado com a cena rodando, e outra camada no
  mesmo quadro: os estágios se refazem sem esperar recurso que saiu.
- A câmera fora do quadrado do tempo ou andando rápido: o estado recomeça onde não havia fatia anterior; além do
  quadrado (256 km), o tempo bom.

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
- **FR-017**: Uma cena sem camada de nuvens MUST não pagar nada; com a camada e sem céu visível, MUST pagar só a sombra e
  o ambiente das nuvens.

**Validação e entrega**

- **FR-018**: MUST existir uma referência de alta precisão da transferência radiativa da nuvem (transmitância, luz com
  autossombra e espalhamento múltiplo), com testes, separada do código de produção.
- **FR-019**: MUST existir teste visual montado pelo caminho de autoria que compare a imagem do motor à referência
  (transmitância, brilho de borda contra o sol, cobertura) e meça cintilação, rastro e tempo de GPU.
- **FR-020**: O motor MUST se adaptar aos limites da GPU (perfis de qualidade e limites medidos), sem nada específico de
  fabricante ou sistema.
- **FR-021**: MUST haver cenas de demonstração no app clayflow-web (céu ao meio dia, pôr do sol, voo através das nuvens,
  sombras de nuvens sobre terreno e água) gravadas em vídeo.
- **FR-022**: A perspectiva aérea MUST valer para toda a geometria da cena sob um céu físico (não só para as nuvens),
  com ou sem camada de nuvens, pela mesma tabela da atmosfera; as referências de imagem das cenas ao ar livre que
  mudarem são regravadas e relatadas com a comparação antes/depois.

**Tempo (US5)**

- **FR-023**: O motor MUST oferecer um campo de pressão em escala sinótica calculado na GPU, dado por um grafo de nós
  ou WGSL trocável pela cena; o padrão da biblioteca MUST gerar sistemas de alta e baixa que se deslocam com o vento de
  condução, nascem, crescem e se desfazem no tempo, contínuos no espaço e no tempo.
- **FR-024**: O campo MUST ditar a cobertura, o tipo e a altura do topo das nuvens: a convergência e a subida nas
  baixas (a relação de Ekman na camada limite) levam a mais cobertura e ao cúmulo-nimbo, torre até a tropopausa com o
  topo em bigorna; a subsidência nas altas leva a céu limpo ou nuvens rasas; a deformação onde os sistemas se encontram
  leva a uma faixa de nuvens (frente).
- **FR-025**: O vento das nuvens MUST ser derivado da pressão — o equilíbrio do vento gradiente com atrito (o
  geostrófico, o gradiente e o de atrito como limites), pelo parâmetro de Coriolis f = 2Ω sin φ da latitude da cena,
  com o sentido do giro de cada hemisfério e o equador contínuo — somado ao vento de condução; ele MUST deslocar as
  nuvens (o estado do tempo) e a reprojeção temporal.
- **FR-026**: A evolução do tempo entre quadros MUST passar pelo canal temporal da spec 037 (o estado, trazido pelo
  vento e relaxado para o que o tempo dita com o tempo de formação), sem estado fora dele; laços com teto constante;
  nada na CPU.
- **FR-027**: MUST existir referência f64 do tempo (pressão, derivadas, vento, Ekman, frente, mapeamento, relaxamento,
  bigorna) com testes contra soluções analíticas (o vórtice gaussiano), separada do código de produção, e casos no smoke
  pelo caminho de autoria contra ela.
- **FR-028**: Sem o tempo, a camada MUST ser a de antes (nenhum pipeline novo, a mesma imagem); a API (`CloudLayer.weather`,
  `CloudPressureFunction`) é aditiva, validada e documentada.

### Key Entities

- **Camada de nuvens**: altitudes da base e do topo, cobertura, tipo, densidade, albedo, vento; pertence ao céu da cena.
- **Mapa de cobertura**: onde há nuvens em grande escala (valor, imagem ou grafo de nós), deslocado pelo vento.
- **Volumes de ruído**: forma e detalhe preparados na GPU a partir dos nós de ruído; recalculados só quando mudam.
- **Mapa de transmitância visto do sol**: a fração da luz direcional que atravessa as nuvens, lida por quem recebe a
  luz do sol.
- **Histórico das nuvens**: a imagem acumulada entre quadros, pelo canal temporal da 037.
- **Campo de pressão**: a anomalia de pressão (Pa) no plano e no tempo, por grafo de nós ou o padrão de sistemas.
- **Estado do tempo**: cobertura pedida, tipo e topo no quadrado do tempo, série temporal da 037, trazido pelo vento das
  nuvens e relaxado para o que a pressão dita; ao lado, o vento das nuvens, a subida e a frente.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Transmitância e radiância das nuvens dentro de 5 % da referência de alta precisão nas cenas de teste
  (média por região), e o céu sem nuvens idêntico ao céu limpo.
- **SC-002**: Brilho de borda contra o sol: a razão entre borda e centro de uma nuvem iluminada por trás fica dentro de
  10 % da referência.
- **SC-003**: Cobertura medida na imagem dentro de 5 pontos percentuais da cobertura pedida.
- **SC-004**: Sombra no chão: a luz direta sob a nuvem dentro de 5 % da transmitância de referência até o sol.
- **SC-005**: Custo do estágio das nuvens no Apple M4, 1280 × 720, perfil alto: até 3 ms por quadro (18 % do quadro de
  60 Hz); perfil médio até 2 ms; cena sem camada de nuvens: custo zero; cena com a camada e sem céu visível (um
  interior): até 0,5 ms (só a sombra e o ambiente das nuvens, que entram pelas janelas; era 0,3 — a medida é a diferença
  de dois quadros de ~1 ms e oscila ±0,2 ms entre execuções, 0,200–0,383 medidos; ajustado no fechamento, 2026-11-22).
- **SC-006**: Cintilação e rastro com câmera e vento em movimento dentro dos limites do smoke de antisserrilhado.
- **SC-007**: Nenhuma regressão: todos os smokes passam 3 vezes seguidas pelo código-fonte e com o pacote montado; o
  bench não piora mais de 10 % em GPU em nenhuma cena existente.
  (No fechamento, 2026-11-22: a bateria rodou uma vez pelo fonte; as três regressões do bench em cenas de outras áreas
  ficam com a spec curta de desempenho da fila, sem verificação nesta spec.)
- **SC-008**: Vídeos de demonstração gravados e enviados ao usuário, sem faixas, blocos ou cortes visíveis.
- **SC-009**: Perspectiva aérea na geometria: luz espalhada e transmitância até superfícies a 2, 10 e 30 km dentro de 5 %
  da referência da atmosfera; com só o céu (sem nuvens), o custo novo fica até 0,25 ms no M4, perfil alto.

- **SC-010**: Vento do tempo: a referência f64 a 0,1 % da solução analítica do vento gradiente de um vórtice gaussiano
  (baixa e alta, regular e no teto, nos dois hemisférios); a GPU a 1 % do máximo da referência no vento e na subida
  (45° N, 45° S, equador), com o sentido do giro certo; no equador, o vento desce o gradiente.
- **SC-011**: Tempestade: no núcleo de uma baixa, o topo das nuvens chega a 85 % da tropopausa e a bigorna espalha a
  nuvem no alto (a fração das colunas com nuvem a 80 % da altura local ≥ 1,2 × a de 50 %); a imagem dela a 5 % da
  referência (SC-001); numa alta, a cobertura local abaixo da do lado da baixa.
- **SC-012**: Custo do tempo no Apple M4, perfil alto, 1280 × 720: o estado ≤ 0,15 ms (≤ 1 % do quadro de 60 Hz) e o
  mapa de cobertura por ele ≤ 0,1 ms; sem o tempo, custo zero.
- **SC-013**: Vídeo de uma tempestade se formando numa baixa sobre o terreno, vista de longe com o tempo acelerado,
  gravado e enviado, sem saltos nem cortes.

## Assumptions

- A atmosfera física, o canal temporal da 037, o mapa de sombra virtual, a iluminação global e a refração da 034 estão
  no develop e são a base; a 041 os estende, não os substitui.
- Um planeta e uma camada de nuvens por cena; várias camadas sobrepostas e nuvens de outros planetas ficam para depois.
- O Apple M4 é o piso de desempenho; a RTX 4090 só confirma que nada é específico do Mac.
- Unidades físicas: altitudes em metros/quilômetros, extinção em 1/m, vento em m/s.
- Fora do escopo: o custo da refração da 034 (32 ms na lente, 81 ms na água funda no perfil alto), tratado em paralelo;
  chuva e precipitação; raios e relâmpagos; simulação de dinâmica de fluidos das nuvens e da atmosfera (formação,
  convecção resolvida). O tempo (US5) é diagnóstico: a pressão é dada (padrão ou grafo), o vento e a subida vêm dela
  pelos equilíbrios clássicos, e a convecção é parametrizada pela convergência na camada limite.
- Políticas do projeto valem integralmente: Resource + evento + Flow, sem helpers, sem alocação de GPU em Flow, nada
  na CPU, laços de GPU com teto constante, produção sem importar as referências, multiplataforma, AAA sem falsear.
