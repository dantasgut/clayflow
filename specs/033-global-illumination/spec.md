# Feature Specification: Iluminação global (luz rebatida)

**Feature Branch**: `feature/033-global-illumination`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Iluminação global (spec 033, fase F4 do roadmap — `033-global-illumination`). Escopo
conforme a linha da F4 em specs/ROADMAP.md: a luz rebatida (indireta) por fótons emitidos do sol e do céu, rastreados
no compute sobre uma estrutura de aceleração da cena (BVH/SDF/voxels, atualizada com a geometria deformada e escrita na
GPU), reunidos em sondas (irradiância e especular), com acúmulo temporal; generaliza as cáusticas por fótons da 011
para todos os rebatimentos; entra como mais uma contribuição ao ponto de cena `scene_lighting` (materiais, nós e desenho
inalterados) e substitui o hemisfério aproximado da 011. A estrutura de raios também serve ao débito imediato R1 da 011
(refração recalculando o que está atrás do vidro, sem fundo pixelado), corrigido logo após a 033. Dependências
declaradas no ROADMAP: céu físico e sombras por luz (013) e acúmulo temporal (014) ainda não existem — a spec deve
resolver o que a 033 precisa deles. Requisitos gerais: Resource + evento + Flow, sem helpers; motor agnóstico; cada
símbolo WGSL definido uma vez; sem leitura de volta por quadro; trajetórias físicas bit a bit; smokes com medidas
inclusive --dist (conservação de energia, convergência, comparação com referência de traçado de caminhos offline na CPU
em cenas simples como a Cornell box, ausência de vazamento de luz, estabilidade temporal); bench sem regressão relevante
e baseline; npm run ci verde; vídeos para o usuário. Pendências da 011 (US4–US6, fixtures, docs, bench) continuam na
fila."

## Contexto e Problema

Depois da 011, toda a luz que chega a uma superfície vem direto de uma fonte (direcional, pontual, spot) ou do
hemisfério céu/chão — uma aproximação uniforme que não sabe o que há na cena:

| Lacuna                 | Estado atual                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sem luz rebatida       | Um chão vermelho iluminado pelo sol não tinge a parede branca ao lado; um cômodo com uma janela fica preto onde o sol não bate                                                          |
| Ambiente sem oclusão   | O hemisfério ilumina igual o canto fechado e o campo aberto: o interior de uma caixa recebe o mesmo céu que o topo                                                                      |
| Céu sem física         | O céu é duas cores fixas; não depende da posição do sol nem colore a luz conforme a hora                                                                                                |
| Cáusticas só na água   | Só a superfície da água concentra luz; vidro, metal polido e outras superfícies não projetam cáusticas                                                                                  |
| Sem estrutura de raios | Nada no motor responde "o que este raio atinge"; a refração da 011 amplia uma cópia da tela (o débito R1)                                                                               |
| Geometria viva na GPU  | As superfícies paramétricas, corpos moles, fluidos e grafos de geometria escrevem posições na GPU a cada quadro: qualquer estrutura de raios precisa acompanhá-las sem leitura de volta |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Luz que rebate na cena (Priority: P1)

Quem monta uma cena vê a luz se comportar como no mundo: o sol entra por uma abertura e ilumina o cômodo por
rebatimento; uma parede colorida tinge as superfícies vizinhas; os cantos e as frestas recebem menos luz do que as áreas
abertas; um objeto escuro perto de uma parede clara fica mais claro do lado da parede.

**Why this priority**: é o objetivo da spec e o que separa uma imagem física de uma imagem "de jogo antigo"; o usuário
pediu luz de ambiente por fótons, como a do sol.

**Independent Test**: uma caixa de Cornell (paredes vermelha e verde, luz no teto) comparada à referência de traçado
de caminhos calculada na CPU, região por região.

**Acceptance Scenarios**:

1. **Given** a caixa de Cornell com uma luz no teto, **When** a cena desenha com a iluminação global ligada, **Then** a
   radiância média de cada região (paredes, chão, teto, faces dos blocos) fica a ≤ 10 % da referência de traçado de
   caminhos com o mesmo número de rebatimentos.
2. **Given** uma parede vermelha ao lado de um chão branco iluminado, **When** desenhado, **Then** o chão perto da parede
   recebe luz vermelha (a razão vermelho/verde da luz indireta cresce perto da parede, como na referência).
3. **Given** um cômodo fechado com uma janela por onde entra o sol, **When** desenhado, **Then** as paredes onde o sol
   não bate recebem luz indireta (não ficam pretas) e a energia total refletida segue a referência.
4. **Given** um canto côncavo e uma superfície aberta com o mesmo material, **When** iluminados pelo céu, **Then** o
   canto recebe menos luz que a superfície aberta, na proporção da referência.
5. **Given** a iluminação global ligada, **When** comparada à cena só com luz direta, **Then** nenhuma superfície fica
   mais escura do que só com a luz direta (a luz indireta só soma).

---

### User Story 2 - Céu físico como fonte de luz (Priority: P1)

O céu é calculado pela posição do sol: azul de dia, alaranjado no fim da tarde, escuro à noite. Ele ilumina a cena por
todas as direções (com oclusão, pela iluminação global) e o sol é a luz direcional da cena, com a cor que a atmosfera
dá a ele.

**Why this priority**: a luz rebatida precisa de uma fonte de céu com direção e cor físicas; o hemisfério de duas cores
fixas não serve como fonte.

**Independent Test**: varrer a altura do sol e medir a cor e a intensidade do céu e do sol contra o modelo de
referência; ver a cena mudar de cor ao longo do dia.

**Acceptance Scenarios**:

1. **Given** o sol a 60° de altura, **When** o céu é avaliado, **Then** a radiância do céu em direções de referência fica
   a ≤ 5 % do modelo analítico de referência.
2. **Given** o sol descendo até o horizonte, **When** a cena desenha, **Then** o sol e o céu esquentam de cor (a razão
   vermelho/azul da luz cresce de forma monótona) e a intensidade cai.
3. **Given** a direção da luz direcional ligada ao céu, **When** ela muda, **Then** o céu e a iluminação global
   acompanham no mesmo quadro, sem recompilar.
4. **Given** uma cena sem céu físico, **When** desenhada, **Then** o hemisfério da 011 continua valendo (compatibilidade).

---

### User Story 3 - Geometria viva e cenas grandes (Priority: P1)

A luz rebatida acompanha o que se move e se deforma: superfícies paramétricas animadas, panos e corpos moles, fluidos e
geometria de grafos de nós. Quem anima a cena não precisa fazer nada para a iluminação global acompanhar.

**Why this priority**: o motor é de mundos matemáticos vivos, com a geometria escrita na GPU; uma iluminação global
que só funcionasse com malhas paradas não serviria.

**Independent Test**: uma superfície que se deforma a cada quadro ao lado de uma parede; a luz indireta muda junto, sem
leitura de volta.

**Acceptance Scenarios**:

1. **Given** uma superfície paramétrica animada, **When** ela muda de forma, **Then** a luz rebatida segue a forma nova
   em até 0,25 s (a sombra indireta e o tingimento mudam de lugar).
2. **Given** geometria escrita só na GPU (corpos moles, grafos), **When** a cena desenha, **Then** essa geometria
   participa da iluminação global (recebe e rebate luz) sem nenhuma leitura de volta.
3. **Given** uma cena com 1 milhão de triângulos, **When** a iluminação global está ligada, **Then** o quadro continua
   dentro do orçamento documentado.

---

### User Story 4 - Estável no tempo, sem vazamento (Priority: P1)

A luz indireta não ferve nem pisca: com a câmera e a cena paradas, a imagem converge e fica estável; com a câmera
andando, não aparecem manchas que nadam. A luz não atravessa paredes: o interior de uma caixa fechada fica escuro mesmo
com sol forte do lado de fora.

**Why this priority**: o ruído e o vazamento são os defeitos mais visíveis de iluminação global em tempo real; sem
resolvê-los, a imagem fica pior do que sem iluminação global.

**Independent Test**: medir a variância temporal da luz indireta com tudo parado e com a câmera andando; medir a luz
dentro de uma caixa fechada sob sol forte.

**Acceptance Scenarios**:

1. **Given** câmera e cena paradas, **When** passam 2 s, **Then** a variação da luz indireta entre quadros cai abaixo do
   limiar documentado (convergência) e a média fica a ≤ 2 % do valor convergido.
2. **Given** a câmera andando devagar, **When** desenhada, **Then** a variância temporal da luz indireta fica abaixo do
   limiar documentado (sem manchas que nadam).
3. **Given** uma caixa fechada de paredes finas sob sol forte, **When** desenhada, **Then** a luz indireta dentro dela é
   ≤ 1 % da do lado de fora (sem vazamento pelas paredes).
4. **Given** uma luz que acende de repente, **When** desenhada, **Then** a luz indireta responde em até 0,25 s, sem
   "rastro" do estado anterior depois disso.

---

### User Story 5 - Cáusticas de todas as superfícies (Priority: P2)

Vidro, metal polido e água concentram a luz do sol: uma esfera de vidro projeta um ponto de luz focado, um anel de
metal projeta a curva cáustica dentro dele. O mesmo mecanismo da água da 011 vale para tudo que reflete ou refrata.

**Why this priority**: generaliza as cáusticas da 011 e completa o realismo da luz rebatida; depende da estrutura de
raios da US1.

**Independent Test**: esfera de vidro sob o sol com o foco medido contra a posição e a concentração ópticas; anel de
metal com a curva cáustica.

**Acceptance Scenarios**:

1. **Given** uma esfera de vidro (IOR 1,5) sob o sol, **When** desenhada, **Then** o ponto de luz no chão fica na
   distância focal da lente esférica (erro ≤ 10 %) e é mais claro que o chão iluminado ao redor.
2. **Given** um anel metálico polido sob luz rasante, **When** desenhado, **Then** a curva cáustica (cardioide)
   aparece dentro dele.
3. **Given** as cáusticas da água da 011, **When** a cena usa a iluminação global, **Then** elas continuam (pelo mesmo
   mecanismo, sem duplicar luz).

---

### User Story 6 - Raios para outros usos (Priority: P2)

A estrutura de raios da cena fica disponível para outros estágios: a refração que recalcula o que está atrás do vidro
(o débito R1 da 011, corrigido logo depois desta spec), consultas de visibilidade e reflexos.

**Why this priority**: a mesma estrutura serve a mais de um efeito físico; deixá-la como recurso da cena evita que cada
efeito crie a sua.

**Independent Test**: um estágio de teste consulta "o que este raio atinge" em cenas conhecidas e compara com a
interseção analítica.

**Acceptance Scenarios**:

1. **Given** cenas com esferas, caixas e superfícies paramétricas conhecidas, **When** raios são consultados na GPU,
   **Then** o ponto e a normal atingidos coincidem com a interseção analítica (erro ≤ 1 % do tamanho do objeto).
2. **Given** a estrutura de raios, **When** um estágio novo a consulta, **Then** ele não conhece a forma da geometria
   nem quem a escreveu (o mesmo contrato para malhas, superfícies e geometria de grafos).

---

### User Story 7 - Fluidos como superfície contínua por campo de distância (Priority: P1)

A água e os outros fluidos aparecem como uma superfície lisa e contínua no espaço — sem a borda recortada em
semicírculos das partículas, sem a textura em favo de mel e sem a linha de brilho serrilhada na borda que o bench mostra
hoje — vista de perto ou de longe, em qualquer resolução de tela. A mesma superfície é a que a luz rebatida, os reflexos,
a refração e as cáusticas enxergam.

**Why this priority**: o usuário avaliou a água do bench como "boa, mas não satisfatória o suficiente"; os defeitos
vêm da reconstrução da superfície na tela a partir das esferas das partículas. Um campo de distância com sinal (SDF)
construído das partículas no espaço dá uma superfície contínua, independente da tela, e participa da estrutura de raios.

**Independent Test**: o tanque de água do bench e da 017 de perto e de longe; medir a continuidade da silhueta e da
normal da superfície, e a ausência de padrões da escala das partículas.

**Acceptance Scenarios**:

1. **Given** o tanque com água em repouso, **When** desenhado de perto (uma partícula cobrindo ≥ 20 pixels), **Then** a
   silhueta e a borda da água são contínuas: nenhuma ondulação na escala do espaçamento das partículas acima do limiar
   documentado (sem semicírculos).
2. **Given** a superfície em repouso, **When** desenhada, **Then** a normal varia suavemente: nenhum padrão periódico na
   escala das partículas (sem favo de mel) — a energia espectral nessa frequência abaixo do limiar documentado.
3. **Given** a borda da água contra o vidro do tanque, **When** desenhada, **Then** o realce da borda é contínuo (sem
   pontos isolados nem serrilhado).
4. **Given** a água em movimento, **When** desenhada, **Then** a superfície acompanha as partículas a cada quadro e a
   massa visível se conserva (o volume do campo dentro de ±5 % do volume das partículas).
5. **Given** a resolução da tela dobrada, **When** desenhada, **Then** a superfície fica igualmente lisa (a nitidez
   não depende da resolução do campo além do documentado; sem pixelização ampliada).
6. **Given** o fundo do tanque sob a água iluminado pelo sol, **When** desenhado, **Then** a sombra e a borda das
   cáusticas que a água projeta no fundo são contínuas (sem o serrilhado em semicírculos da cobertura da água vista pela
   luz, que o bench mostra hoje): nenhuma ondulação na escala das partículas acima do limiar documentado.
7. **Given** a superfície por campo de distância, **When** a luz rebatida, os reflexos, a refração e as cáusticas a
   consultam, **Then** é a mesma superfície vista pela câmera (os raios a atingem com erro ≤ meio espaçamento de
   partícula).

---

### User Story 8 - Névoa e meios volumétricos (Priority: P2)

Quem monta a cena coloca névoa, neblina ou fumaça como volumes: a luz do sol atravessa e forma feixes (raios de
luz), a névoa clareia com a luz rebatida e escurece onde há sombra, objetos ao longe somem na névoa pela distância — sem
faixas, sem blocos e sem pixelização.

**Why this priority**: o usuário pediu névoa volumétrica; o meio participante usa a mesma estrutura de campos e a
mesma luz (direta, sombra, rebatida) da spec.

**Independent Test**: um volume de névoa homogênea com o sol: medir a transmitância contra Beer-Lambert e os feixes
contra a referência de traçado de caminhos com meio participante na CPU.

**Acceptance Scenarios**:

1. **Given** névoa homogênea de densidade conhecida, **When** um objeto é visto através dela, **Then** a atenuação segue
   Beer-Lambert pela distância (erro ≤ 3 %).
2. **Given** a névoa com o sol passando por uma janela, **When** desenhada, **Then** aparece o feixe de luz (o
   espalhamento simples segue a referência a ≤ 10 %) e a névoa fora do feixe é mais escura.
3. **Given** a névoa num cômodo, **When** a iluminação global está ligada, **Then** a névoa recebe a luz rebatida (clareia
   perto das paredes iluminadas).
4. **Given** uma densidade variando no espaço (um campo, um nó, uma função de ruído), **When** desenhada, **Then** a
   névoa segue a densidade sem faixas nem blocos (variação entre pixels vizinhos sem degraus acima do limiar).
5. **Given** a câmera andando pela névoa, **When** desenhada, **Then** a névoa é estável no tempo (sem cintilação acima
   do limiar).

---

### Edge Cases

- Cena sem nenhuma luz e sem céu: a iluminação global não acrescenta nada (sem energia inventada).
- Material emissivo: ilumina a cena por rebatimento como uma fonte (uma lâmpada de malha emissiva ilumina o cômodo).
- Material transmissivo (vidro): a luz atravessa com a absorção e a refração do material; não é tratado como opaco.
- Geometria muito fina (paredes de uma face, folhas): não vaza luz; a espessura mínima suportada é documentada.
- Objetos minúsculos frente às sondas: a luz indireta deles é aproximada pela resolução das sondas, documentada.
- Geometria que entra ou sai da cena: a estrutura de raios e a luz indireta se atualizam no mesmo quadro ou no seguinte.
- Fluido com poucas partículas (gotas isoladas, spray): o campo de distância não as funde numa bolha; a superfície
  segue gotas separadas com o raio documentado.
- Fluido tocando um sólido: a superfície encosta no sólido sem vão nem sobreposição visível.
- Névoa dentro de um vidro ou da água: os dois meios se compõem (a névoa atrás do vidro aparece refratada).
- Névoa muito densa (opaca): os objetos atrás somem; sem banda no limite.
- Espaços curvos (019, futuro): a estrutura de raios é a do espaço plano nesta spec; o contrato fica aberto ao raio
  curvo (documentado).
- Sondas dentro da geometria: não contaminam a luz em volta (detectadas e desligadas ou deslocadas).
- Muitas luzes (1024): os fótons são distribuídos pela potência de cada luz, sem custo linear no número de luzes.
- Céu abaixo do horizonte (noite): o céu escurece até o mínimo documentado; a luz das lâmpadas continua rebatendo.
- Dispositivo sem os limites de GPU necessários: a iluminação global se desliga com aviso e a cena volta ao hemisfério.

## Requirements _(mandatory)_

### Functional Requirements

**Estrutura de raios da cena**

- **FR-001**: DEVE existir uma estrutura de aceleração da cena na GPU que responda "o que este raio atinge" (ponto,
  normal, material, distância), construída e atualizada na GPU a partir de toda geometria desenhada — malhas,
  superfícies paramétricas, geometria escrita por estágios (corpos moles, grafos) — sem leitura de volta.
- **FR-002**: A estrutura DEVE acompanhar geometria que se deforma a cada quadro, com custo documentado por quadro, e
  entrada e saída de objetos sem reconstrução completa quando não for necessária.
- **FR-003**: A estrutura DEVE ser um recurso da cena consultável por qualquer estágio por um contrato único, que não
  expõe a forma de origem da geometria.

**Fontes**

- **FR-004**: DEVE existir um céu físico calculado da posição do sol (modelo analítico de atmosfera documentado), ligado
  à luz direcional que faz o papel de sol, usado como fonte da iluminação global e como fundo visível da cena.
- **FR-005**: As luzes da cena (direcional, pontual, spot), o céu e os materiais emissivos DEVEM ser fontes de fótons,
  distribuídos pela potência de cada uma.

**Iluminação global**

- **FR-006**: A luz rebatida DEVE ser calculada por fótons emitidos das fontes e rastreados pela estrutura de raios, com
  os materiais da 011 (fechamento por nós) decidindo reflexão, transmissão e absorção em cada rebatimento, até um número
  de rebatimentos documentado.
- **FR-007**: A luz rebatida DEVE ser reunida em sondas no espaço (irradiância difusa e radiância especular), com
  visibilidade por sonda para evitar vazamento através de paredes.
- **FR-008**: A iluminação global DEVE chegar ao desenho como contribuição ao ponto de cena `scene_lighting` (011): os
  materiais, os nós e os estágios de desenho não mudam; com ela, o hemisfério aproximado da 011 é substituído.
- **FR-009**: O acúmulo temporal DEVE ser feito no espaço das sondas (não na tela), convergindo com a cena parada e
  respondendo a mudanças (luz, geometria, material) em até 0,25 s.
- **FR-010**: As cáusticas DEVEM ser produzidas pelo mesmo rastreamento de fótons para toda superfície especular ou
  transmissiva, sem duplicar a luz da água da 011.

**Campos de distância: fluidos e meios volumétricos**

- **FR-016**: Os fluidos de partículas DEVEM ter uma superfície por campo de distância com sinal construída na GPU a
  cada quadro a partir das partículas (núcleo de suavização documentado, sem fundir gotas separadas), desenhada por
  marcha de raio com reconstrução contínua (interpolação de ordem alta), independente da resolução da tela, substituindo
  a reconstrução na tela da 017 para a câmera, a luz (sombra e cobertura da água no fundo) e as cáusticas.
- **FR-017**: A estrutura de raios DEVE ser híbrida: triângulos e esferas pela BVH e volumes de campo (fluidos e meios)
  por marcha no campo, pela mesma consulta de raio.
- **FR-018**: DEVE existir o meio participante por volume (densidade constante, por campo ou por função/nó; albedo de
  espalhamento; anisotropia de fase), iluminado pela luz direta com sombra, pelo céu e pela luz rebatida, desenhado sem
  faixas nem blocos e estável no tempo, com a absorção e o espalhamento consultáveis pelos raios (a névoa atenua a luz
  rebatida e as cáusticas).

**Qualidade, contrato e compatibilidade**

- **FR-011**: Nenhuma parte DEVE exigir leitura de volta por quadro; as trajetórias físicas DEVEM continuar idênticas,
  bit a bit.
- **FR-012**: A iluminação global DEVE poder ser ligada, desligada e ajustada (qualidade, número de rebatimentos,
  resolução das sondas) por Resource da cena, sem recompilar ao mudar valores.
- **FR-013**: Cenas sem céu físico e sem iluminação global DEVEM continuar como na 011.
- **FR-014**: Smokes com medidas, no fonte e no build minificado: comparação com referência de traçado de caminhos na
  CPU (Cornell box e cenas simples), conservação de energia, convergência, estabilidade temporal, vazamento, céu contra o
  modelo, cáusticas contra a óptica, raios contra a interseção analítica; `bench:check` sem regressão relevante e
  baseline regravado; `npm run ci` verde.
- **FR-015**: Documentação de arquitetura, guias, ROADMAP e PENDENCIAS atualizados; vídeos para o usuário (água por
  campo de distância de perto e de longe, névoa com feixes de sol, Cornell box,
  cômodo com sol ao longo do dia, geometria viva, cáusticas).

### Key Entities

- **Estrutura de raios da cena**: a representação da geometria para consultas de raio, mantida na GPU.
- **Céu físico**: a atmosfera avaliada pela direção do sol; fonte de luz e fundo.
- **Fóton**: um pacote de energia que sai de uma fonte e rebate pela cena segundo os materiais.
- **Sonda**: um ponto do espaço que guarda a luz que chega de todas as direções (difusa e especular) e a visibilidade.
- **Iluminação global**: o Resource que liga, desliga e ajusta a luz rebatida da cena.
- **Campo de distância**: o volume no espaço que guarda, por ponto, a distância à superfície de um fluido (ou a
  densidade de um meio), construído na GPU e consultado pela câmera e pelos raios.
- **Meio participante**: um volume de névoa, neblina ou fumaça com densidade, albedo e fase.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Cornell box: radiância média por região a ≤ 10 % da referência de traçado de caminhos com o mesmo número
  de rebatimentos.
- **SC-002**: Conservação de energia: num ambiente fechado de paredes brancas de albedo conhecido, a radiância converge
  para o valor analítico da série de rebatimentos (≤ 5 %); nenhuma superfície fica mais escura que só com a luz direta.
- **SC-003**: Céu: radiância a ≤ 5 % do modelo de referência em direções de amostra; cor do sol e do céu monótona com
  a altura do sol.
- **SC-004**: Vazamento: dentro de uma caixa fechada sob sol forte, luz indireta ≤ 1 % da de fora.
- **SC-005**: Estabilidade: com tudo parado, a luz indireta converge em ≤ 2 s e fica a ≤ 2 % do valor convergido; com a
  câmera andando, variância temporal abaixo do limiar documentado.
- **SC-006**: Resposta: mudança de luz, de geometria ou de material refletida na luz indireta em ≤ 0,25 s.
- **SC-007**: Geometria viva: geometria escrita só na GPU participa da iluminação global; zero leituras de volta por
  quadro.
- **SC-008**: Cáusticas: foco da esfera de vidro na distância focal óptica (≤ 10 %); cardioide do anel presente.
- **SC-009**: Raios: ponto e normal atingidos a ≤ 1 % da interseção analítica.
- **SC-010**: Desempenho: custo da iluminação global por quadro dentro do orçamento documentado a 1280×720 com 1 milhão
  de triângulos; `bench:check` sem regressão relevante nas cenas sem iluminação global.
- **SC-011**: Trajetórias físicas idênticas bit a bit; smokes no fonte e com `--dist`; `npm run ci` verde.
- **SC-012**: Vídeos (água por campo de distância de perto e de longe, névoa com feixes de sol, Cornell box, cômodo com o
  sol ao longo do dia, geometria viva, cáusticas) enviados ao usuário.
- **SC-013**: Água por campo de distância: sem ondulação na escala das partículas na silhueta, na normal e na sombra e
  nas cáusticas projetadas no fundo (abaixo dos limiares documentados), realce de borda contínuo, volume a ±5 % das partículas, igualmente lisa com a resolução
  dobrada; o tanque do bench avaliado de novo lado a lado com a versão da 017.
- **SC-014**: Névoa: Beer-Lambert a ≤ 3 %; feixe de espalhamento simples a ≤ 10 % da referência da CPU; sem degraus entre
  pixels vizinhos acima do limiar; variância temporal abaixo do limiar com a câmera andando.

## Assumptions

- Dependências do ROADMAP resolvidas nesta spec pelo mínimo necessário: o **céu físico** analítico (como fonte e fundo)
  entra aqui; a iluminação por imagem (mapas de ambiente), os reflexos de ambiente filtrados e a iluminação clustered
  continuam na 013. As **sombras** das luzes diretas além da direcional que já projeta continuam na 013 — a luz
  indireta usa a estrutura de raios para a própria visibilidade. O **acúmulo temporal** é no espaço das sondas, próprio
  desta spec; o TAA de tela continua na 014.
- WebGPU não tem traçado de raios em hardware: a estrutura e o rastreamento são feitos em compute.
- A luz direta continua como na 011 (laço das luzes e a sombra da direcional); a iluminação global soma só a luz
  rebatida (e o céu com oclusão), sem contar a direta duas vezes.
- O número de rebatimentos padrão é documentado (ex.: 3) e ajustável; a referência da Cornell box usa o mesmo número.
- O orçamento de tempo da iluminação global é documentado no plano a partir de medições; a qualidade escala pela
  resolução das sondas e pelo número de fótons por quadro.
- O débito imediato R1 da 011 (refração recalculando o fundo) é corrigido logo após esta spec, usando a estrutura de
  raios; as pendências restantes da 011 (US4–US6, fixtures de imagem, documentação, bench) continuam na fila.
- Espaços curvos (019) e conteúdo procedural (F8) usarão o mesmo contrato de raios; esta spec trata o espaço plano.
- A superfície por campo de distância substitui a reconstrução na tela da 017 para os fluidos de partículas; a água de
  grande escala (029) e o fogo e a fumaça simulados (026) usarão os mesmos campos e meios. As partículas continuam a
  simulação (inalterada, trajetórias bit a bit).
- Incluído a pedido do usuário (2026-10-17): o campo de distância para fluidos e névoa volumétrica, sem pixelização.
