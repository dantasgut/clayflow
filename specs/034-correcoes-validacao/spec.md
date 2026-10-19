# Feature Specification: Correções da validação na RTX 4090

**Feature Branch**: `fix/034-correcoes-validacao`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "Quero uma análise e uma spec de correções" — depois da validação na RTX 4090 (Linux) das
pendências do Mac e dos vídeos das demos: manchas de ruído na luz da cena com janela; a névoa ao longo do dia; "se a
outra sessão fez a implementação correta para a luz"; "se as implementações estão de fato modulares e se realmente
realizam processamento sem duplicar coisas, pois o desempenho pode ser afetado se algum algoritmo estiver mal
implementado"; e as falhas de smoke que vêm desde a 011.

## Contexto e Problema

A [análise](analise.md) mostra que a 033 acerta a radiometria (unidades, π, rebatimentos, sol sem dupla contagem,
névoa física) e que a arquitetura é modular na fronteira com a GPU. Os defeitos estão em quatro frentes, cada uma
com os achados da análise:

| Frente                | Sintoma visível ou custo                                                                   | Achados      |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------ |
| Luz                   | Manchas paradas nas paredes; cáusticas com metade da energia; serrilhado e blocos na névoa | L1–L9        |
| Trabalho desperdiçado | GPU e CPU gastas sem nada mudar ou com o recurso ausente                                   | D1–D10       |
| Modularidade          | Símbolos WGSL repetidos, objetos-deus, importação fora do contrato                         | M1–M5        |
| Smokes e ferramentas  | Smokes vermelhos desde a 011, bench preso a 60 FPS, teste que estoura no CI                | S1–S4, V1–V6 |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Luz indireta limpa e convergente (Priority: P1)

Quem monta uma cena com luz forte entrando por uma abertura (sol pela janela) vê paredes lisas, sem manchas, com a
câmera parada ou andando devagar; a imagem parada melhora com o tempo até ficar estável.

**Why this priority**: é o defeito visível que motivou a análise (L1); compromete a promessa da F4 ("superior ao
Three.js … ruído temporal").

**Independent Test**: smoke novo na cena com janela (`medium`, sol a 50°, câmera parada) medindo manchas, ruído
temporal e viés contra a referência sem gather de tela e contra o traçado de caminhos na CPU.

**Acceptance Scenarios**:

1. **Given** a cena com janela no `medium` e a câmera parada, **When** passam 2 s depois da GI pronta, **Then** o
   desvio de alta frequência na parede fica a ≤ 1,1× o da mesma cena sem gather de tela e a variação quadro a quadro
   ≤ 0,1 (8 bits).
2. **Given** a mesma cena, **When** passam 10 s parados, **Then** a média de cada região fica a ≤ 2 % do valor
   convergido (SC de convergência da 033 cumprido também nesta cena).
3. **Given** a câmera andando 0,5 m/s, **When** o vídeo realtime é gravado, **Then** nenhuma mancha persiste por mais de
   0,25 s em lugar fixo da parede (inspeção do vídeo + métrica de manchas por quadro).
4. **Given** quinas e vãos finos (verga da janela), **When** renderizados no `medium`, **Then** não há entalhes escuros
   (raios pela face de trás fora da média; L4, L5).

---

### User Story 2 - Cáusticas com a energia certa (Priority: P1)

As cáusticas (esfera de vidro, água) têm a energia que o traçado de referência dá, em qualquer altura do plano
receptor.

**Why this priority**: erro físico de até 2× (L2) na GI; nenhum smoke mede hoje a energia das cáusticas por fótons.

**Independent Test**: smoke de conservação — fluxo integrado da cáustica de uma lente sobre planos em y = 0, y = h/4 e
inclinado a 30°, comparado ao fluxo que a lente intercepta.

**Acceptance Scenarios**:

1. **Given** uma esfera de vidro focando o sol num chão em y = 0, **When** a cáustica converge, **Then** o fluxo
   integrado fica a ≤ 5 % do fluxo interceptado pela esfera menos as perdas de Fresnel.
2. **Given** o mesmo arranjo com o chão em outra altura ou inclinado, **Then** o fluxo não varia mais que 5 % entre os
   casos.

---

### User Story 3 - Sem trabalho quando nada muda ou o recurso não existe (Priority: P2)

Uma cena parada, ou sem o recurso que um passe serve, não gasta GPU nem CPU com ele: sem cáusticas sem alvo, sem
estrutura de raios sem consumidor, sem campo de fluido pausado refeito, sem sombra redesenhada sem mudança.

**Why this priority**: resposta direta à preocupação com desempenho (D1–D9); ganho grande com mudanças pequenas.

**Independent Test**: bench por passe (timestamp) em cenas de controle — parada, sem vidro, GI desligada, simulação
pausada — comparando antes e depois.

**Acceptance Scenarios**:

1. **Given** uma cena com luz pontual e nenhum material especular/transmissivo, **When** a GI roda, **Then** traço e
   resolve dos fótons custam 0 dispatch (D1).
2. **Given** a GI removida ou `enabled: false`, **Then** a `RayScene` inserida por ela sai, o hemisfério volta e o
   prepass deixa de ser forçado; o custo de GPU volta ao da cena sem GI (±3 %) (D2).
3. **Given** uma cena parada (nenhum transform, partícula ou geometria muda), **When** passam 60 quadros, **Then** a
   estrutura de raios não faz refit nem rebuild, o campo do fluido não é refeito e o mapa de sombra não é redesenhado
   (D3, D4, D7).
4. **Given** 10 corpos rígidos e 100k meshes estáticas, **Then** o `TransformFlow` recompõe só os transforms sujos
   (D6).
5. **Given** os defaults do LCP, **Then** o número de passes de compute por passo cai a ≤ 1/4 do atual e o solve
   despacha pelo número de contatos (D5).

---

### User Story 4 - Smokes verdes e confiáveis (Priority: P2)

Todos os smokes passam na 4090 (fonte e `--dist`) e no Mac; cada falha antiga tem causa resolvida no motor, no smoke
ou na fixture — nunca afrouxando o limiar sem justificativa física. Seis checagens antigas falham desde o HDR/AgX/sRGB da 011
(S1): a correção é no motor; critério e limiar não mudam por iniciativa da implementação.

**Why this priority**: os smokes vermelhos desde a 011 (H4, H5) escondem regressões; a corrida do `animated` dá
falso negativo.

**Independent Test**: `npm run smoke` completo, fonte e `--dist`, 3 vezes seguidas sem falha; `npm run ci` verde.

**Acceptance Scenarios**:

1. **Given** os 31 smokes, **When** rodam 3× na 4090, **Then** 31/31 passam nas 3 (S1, S2).
2. **Given** `npm run ci`, **Then** passa sem estouro de tempo (S4).
3. **Given** o `fluidSurface/performance36k`, **Then** registra ≥ 30 amostras de tempo de GPU (S3).
4. **Given** o `parametricSurfaces/animated`, **Then** o caso espera o pronto do motor (compilação dos pipelines do
   collider) em vez de um tempo fixo; sem "device perdido" depois do `dispose`.

---

### User Story 5 - Módulos únicos e camadas respeitadas (Priority: P3)

Cada função WGSL compartilhada existe uma vez; os objetos-deus são divididos por responsabilidade; C3/C4 importam só
os contratos da C2.

**Why this priority**: não muda a imagem, mas evita correções divergentes (o mesmo hash em 6 lugares) e reduz o
acoplamento.

**Independent Test**: checagem automática de símbolos WGSL duplicados; lint da fronteira cobrindo `scene/graph`;
contagem de linhas/responsabilidades.

**Acceptance Scenarios**:

1. **Given** a árvore de WGSL, **When** a checagem roda, **Then** nenhuma função tem corpo idêntico (normalizado) em
   dois arquivos (M1).
2. **Given** o lint, **Then** importar `scene/graph/*` como valor de C3/C4 falha, ou o contrato é ampliado na
   constituição (M3).
3. **Given** `ResourceSystem` e `ForwardFlow`, **Then** nenhum arquivo do núcleo passa de 800 linhas e cada parte tem
   uma responsabilidade nomeada (M2).

---

### User Story 6 - Medir de verdade na 4090 (Priority: P3)

O bench mede FPS e p99 sem teto de vsync e com a GPU em clock de trabalho, para fechar G3 e H3 e gravar o baseline do
perfil `nvidia-lovelace`.

**Why this priority**: sem isso os números de desempenho das US3 não têm referência confiável nesta máquina.

**Independent Test**: `npm run bench` numa cena leve passa de 60 FPS; `bench:baseline` grava e `bench:check` compara.

**Acceptance Scenarios**:

1. **Given** `instances/10k`, **When** o bench roda, **Then** o FPS passa de 60 (sem teto de vsync) (V3).
2. **Given** o baseline `nvidia-lovelace` gravado, **Then** `bench:check` fica verde na mesma build e G3/H3 têm
   número.

### User Story 7 - Refração traçada de verdade (Priority: P1)

Vidro e água mostram o que está atrás pelo caminho físico da luz: o raio refratado atravessa quantas interfaces houver
até uma superfície que não transmite, a rugosidade espalha raios pela distribuição GGX, as faces atravessadas refletem
por raios traçados, a dispersão separa os canais em superfícies próprias, e a água refrata ao sair do volume — nítido
em qualquer ampliação, sem pixels nem degraus.

**Why this priority**: débito imediato R1 da 011 ("primeira tarefa depois da 033"), pedido de imagem lisa. Uma
tentativa anterior da 034 foi descartada por atalhos (cópia da tela no limite de interfaces, desfoque no lugar da
rugosidade, reflexo do ambiente, dispersão iluminada na superfície do canal verde, água saindo sem refratar); esta
história exige o caminho completo.

**Independent Test**: smoke `refraction` contra o traçado de caminhos da CPU: esfera de vidro ampliando 4× um xadrez
fino; pilha de interfaces; vidro rugoso; prisma com dispersão; água com fundo nítido e absorção pela profundidade.

**Acceptance Scenarios**:

1. **Given** a esfera de vidro (IOR 1,5) ampliando 4× um xadrez, **Then** nenhum degrau de pixel na borda das casas e a
   média por região a ≤ 3 % do traçado de caminhos; nenhuma leitura da cópia da tela no caminho do raio.
2. **Given** mais interfaces transmissivas em série do que hoje cabem no limite, **Then** o raio continua até uma
   superfície que não transmite (com limite de profundidade só por energia, documentado), sem cair na cópia da tela.
3. **Given** vidro com rugosidade 0,3, **Then** o borrado vem de raios amostrados pela GGX (variância e largura do lobo
   batem com o traçado de caminhos a ≤ 5 %), não de desfoque na tela.
4. **Given** as faces atravessadas, **Then** o reflexo delas é um raio refletido traçado (reflexo de objetos da cena
   visível nelas), com Fresnel.
5. **Given** dispersão com antisserrilhado, **Then** cada canal segue o próprio raio e é iluminado na superfície que o
   próprio raio acerta.
6. **Given** a água vista de dentro e de fora, **Then** o raio que sai do volume usa a normal da saída, o Fresnel e a
   reflexão interna total; fundo nítido e absorção pela profundidade a ≤ 3 % da referência.

### Edge Cases

- Luz que muda bruscamente (sol atravessando a janela) com histerese sem teto: o detector de transiente precisa
  derrubar a contagem — a resposta (99,6 % a 0,25 s) não pode piorar.
- Campo distante pelas sondas do mundo: uma sonda com vazamento passa o erro ao gather de tela; o critério de
  vazamento (0,067 %) não pode piorar.
- Cena sem nenhuma superfície especular, mas com água adicionada depois: os fótons voltam a ser traçados no quadro em
  que o alvo aparece.
- "Nada mudou" com mudanças só de material (cor/rugosidade) ou da luz: a sombra e as sondas reagem à luz; a estrutura
  de raios não precisa (geometria igual).
- Clamp de firefly não pode apagar a cáustica legítima nem a mancha de sol vista diretamente.

## Requirements _(mandatory)_

### Functional Requirements

**Luz**

- **FR-001**: O gather de tela MUST limitar seus raios ao campo próximo e tomar o campo distante da radiância das
  sondas do mundo na direção do raio, como o Lumen (decisão do usuário, 2026-10-18: a correção de fundo, não só mais
  raios no `medium`), eliminando as fontes pequenas e fortes como origem de variância (L1).
- **FR-002**: O acúmulo do gather de tela MUST ter histerese própria, sem teto fixo enquanto não há transiente
  (`h = N/(N+1)` até um N máximo configurável), mantendo o detector de transiente (L1).
- **FR-003**: Cada raio do gather de tela MUST ter contenção de firefly relativa à média lenta da sonda ou à radiância
  da sonda do mundo, com o viés medido e documentado (L1).
- **FR-004**: O filtro espacial do gather de tela MUST remover o resíduo em baixa frequência (à-trous guiado por
  variância, 2–3 iterações, ou equivalente), respeitando profundidade e normal (L1).
- **FR-005**: Raios de tela que acertam a face de trás MUST sair da média (numerador e denominador), como nas sondas do
  mundo (L4).
- **FR-006**: A normalização das cáusticas MUST conservar o fluxo em qualquer posição e inclinação do receptor —
  depósito e leitura com a mesma base e a soma dos pesos por célula, ou hash no plano tangente (L2).
- **FR-007**: O estado de resposta das sondas MUST ser calculado antes do acúmulo, uma vez por sonda, sem leitura e
  escrita concorrentes (L3).
- **FR-008**: A sombra direcional MUST ter borda sem degrau visível a 1280×720 na cena com janela (filtragem e/ou
  resolução ajustada à cena) (L6).
- **FR-009**: A névoa MUST esconder a estrutura dos froxels (jitter por quadro + reprojeção temporal, ou filtro) (L7).
- **FR-010**: Rebatimentos ≥ 2 MUST ler as sondas com filtragem bilinear; os pesos DDGI MUST ter piso positivo (L8,
  L9).

**Trabalho desperdiçado**

- **FR-011**: Os fótons MUST ter potência zero para toda luz quando não há alvo de cáustica, e traço e resolve MUST
  não despachar nesse caso; a potência por luz MUST ser calculada uma vez por quadro (D1).
- **FR-012**: Desligar ou remover a GI MUST desfazer tudo que a ligação fez (RayScene inserida por ela, hemisfério,
  prepass), e reagir a `enabled` como a inserção/remoção (D2).
- **FR-013**: A estrutura de raios, o campo do fluido e o mapa de sombra MUST pular a atualização quando suas entradas
  não mudaram (revisão do `WorldTransform`, passos do tempo, geometria produzida, luz), e o envelhecimento do BVH MUST
  contar só refits feitos (D3, D4, D7).
- **FR-014**: O `TransformFlow` MUST recompor só os slots sujos (D6).
- **FR-015**: Os dispatches de um mesmo passo de física MUST compartilhar passes de compute quando não há dependência
  que exija separação, e os kernels por contato MUST despachar indiretos pelo contador (D5).
- **FR-016**: Efeitos de pós com força nula MUST não custar passe; vinheta, cromática e grading MUST se fundir na
  apresentação; bloom MUST usar cadeia de mips; blur MUST ser separável (D7).
- **FR-017**: Caminhos de CPU por quadro (UI, ordenação de flows, `specHash`, `JSON.stringify` do céu, cópia das
  grades de névoa, args indiretos) MUST trabalhar só quando a entrada muda (D8).
- **FR-018**: Recursos de um recurso desligado (hash de cáustica, cascatas não usadas) MUST não ser alocados (D9).
- **FR-019**: Os itens D10 MUST ser medidos por passe antes de qualquer mudança; só entram os que passam de 0,1 ms.

**Modularidade**

- **FR-020**: Hashes (Teschner, PCG, chave de célula), meia-precisão, base ortonormal e vertex de tela cheia MUST
  existir uma vez, como módulos `wgslModule` requeridos; a checagem de duplicatas MUST rodar no CI (M1).
- **FR-021**: `prepareIndirect` e o laço de grupos MUST ser compartilhados por Forward e Shadow; as duas grades de
  vizinhança MUST convergir numa (M1).
- **FR-022**: `ResourceSystem` e `ForwardFlow` MUST ser divididos por responsabilidade sem mudar a API pública (M2).
- **FR-023**: A importação de `scene/graph` por C3/C4 MUST entrar na regra do lint ou no contrato da constituição
  (M3).
- **FR-024**: `fs_ssao` MUST ser renomeado ou virar oclusão de ambiente de verdade; FXAA MUST rodar depois do tone map;
  a luminância MUST usar um padrão único (M4, M5).

**Smokes, testes e ferramentas**

- **FR-025**: As seis checagens que falham desde o `5ef1dd46` (S1) MUST ser resolvidas no motor: conferir a
  apresentação (AgX contra a curva de referência, exposição padrão, sRGB), a luz da cena desde o `4046c88e` (níveis
  das luzes e do hemisfério) e o especular dos materiais de teste; corrigir o que divergir da referência. Critérios,
  limiares e espaço de medida dos smokes MUST NOT mudar por iniciativa da implementação: se o motor estiver comprovado
  certo e a checagem medir algo que a apresentação legitimamente muda, a evidência vai ao usuário, que decide (S1).
- **FR-026**: O motor MUST expor prontidão (nenhum Flow preparando, nenhuma verificação ou compilação em voo) e os
  smokes MUST aguardá-la em vez de tempo fixo; a rejeição de compilação depois do dispose MUST ser tratada; um estágio
  obrigatório não pronto MUST segurar o passo da física até ficar pronto (decisão do usuário, 2026-10-18: a física
  espera, a cena aparece parada — nunca simula sem o colisor) (S2; H2).
- **FR-027**: O `npm run ci` MUST passar sem estouro de tempo; `densityAt` da referência MUST usar culling espacial
  (S4).
- **FR-027a**: O profiler de GPU MUST manter leituras com a CPU à frente (anel de stagings, limite de quadros em voo) e
  os smokes de desempenho MUST cadenciar até ter amostras (S3; H1).
- **FR-027b**: O tempo de GPU MUST ser medido uma vez por quadro, de verdade (consulta no início e no fim do quadro,
  leitura atrasada, sem repetir leituras velhas), e os smokes de desempenho MUST usar essa medida (H1).
- **FR-027c**: O custo da água a 64k partículas MUST ser medido na 4090 contra o `develop` e qualquer regressão
  explicada e corrigida na causa (H7).
- **FR-028**: O bench MUST medir sem teto de vsync na 4090 e gravar o baseline `nvidia-lovelace` (V3).
- **FR-029**: Um smoke da cena com janela MUST medir manchas, ruído temporal e viés (US1); um smoke de conservação das
  cáusticas MUST medir o fluxo (US2).
- **FR-030**: As demos de vídeo (cornell, day, fog ao longo do dia, living, caustics) MUST ser regravadas nos dois
  modos ao fim, como evidência visual.

**Débitos de outras fases**

- **FR-031**: A refração MUST seguir o raio pela estrutura de raios através de todas as interfaces transmissivas até
  uma superfície que não transmite, avaliando o material e a luz no acerto; a cópia da tela MUST NOT ser lida no
  caminho do raio (R1 da 011).
- **FR-031a**: A rugosidade da transmissão e da reflexão MUST vir de raios amostrados pela GGX com a densidade
  correta; desfoque na tela é proibido.
- **FR-031b**: O reflexo nas faces atravessadas MUST ser um raio refletido traçado, com Fresnel.
- **FR-031c**: Na dispersão, cada canal MUST seguir e ser iluminado no próprio raio, inclusive com antisserrilhado.
- **FR-031d**: A água MUST refratar ao sair do volume (normal da saída, Fresnel, reflexão interna total).
- **FR-031e**: A normal da superfície da água MUST sair limpa da origem (redistanciamento do campo), sem filtro que
  alise a normal.
- **FR-032**: Toda tarefa aberta das specs anteriores MUST ter estado conferido no código e destino registrado na
  análise (feita e marcada, parte desta spec, fase futura do ROADMAP, obsoleta ou bloqueada).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Cena com janela, `medium`, câmera parada, 2 s após pronta, medido no alvo HDR da parede (smoke `giNoise`):
  manchas (banda de 2–15 px relativa à média) ≤ 1,1× as da referência sem gather de tela; variação entre quadros (média
  de 10 pares) ≤ 0,11 % da média; média a ≤ 2 % do valor a 10 s. Antes: 1,36×, 0,663 %, 0,44 %. O 0,11 % (era 0,1 %)
  e o custo do SC-007 vêm da decisão do usuário de 2026-10-19: `medium` com 16 raios de tela e o guia (medido 0,82×,
  0,104 %, 0,11 %; GI 2,67 ms).
- **SC-002**: Viés do gather de tela (clamp e campo distante) ≤ 3 % na média por região contra o traçado de caminhos
  da Cornell e da cena com janela.
- **SC-003**: Fluxo da cáustica ≤ 5 % do de referência em y = 0, y = h/4 e plano a 30°.
- **SC-004**: Cena sem alvo de cáustica: 0 dispatch de fótons. GI desligada: GPU a ±3 % da cena sem GI.
- **SC-005**: Cena parada por 60 quadros: 0 refit/rebuild da estrutura de raios, 0 reconstrução do campo, 0 redesenho
  da sombra.
- **SC-006**: Passes de compute por passo do LCP ≤ 1/4 do atual; CPU de `rigid-bodies/10k` cai ≥ 0,5 ms.
- **SC-007**: Orçamento da GI na 4090 ≤ 2,7 ms com o gather corrigido (era ≤ 2,19 ms, sem regressão; decisão do
  usuário de 2026-10-19 pelos 16 raios de tela no `medium`); na cena sem alvo de cáustica
  cai pelo custo dos fótons.
- **SC-008**: Smokes 31/31 em 3 rodadas seguidas, fonte e `--dist`, 0 pageerrors; `npm run ci` verde 3×; as seis
  checagens de S1 passam também no Mac sem regravar fixture.
- **SC-009**: Nenhuma função WGSL duplicada (checagem no CI); nenhum arquivo do núcleo acima de 800 linhas.
- **SC-010**: Bench na 4090 acima de 60 FPS em cena leve; baseline `nvidia-lovelace` gravado; G3 e H3 com número.
- **SC-011**: Critérios da 033 sem regressão (vazamento ≤ 0,067 %, resposta ≥ 99 % a 0,25 s, estabilidade, névoa).
- **SC-012**: Refração com ampliação de 4×: 0 degraus de pixel da cópia na borda do xadrez; média por região a ≤ 3 %
  do traçado de caminhos.
- **SC-014**: Refração: os seis cenários da US7 a ≤ 3 % do traçado de caminhos (rugosidade ≤ 5 %); 0 leituras da
  cópia da tela no caminho do raio (verificado no WGSL e por um teste que remove a cópia).
- **SC-015**: Tempo de GPU por quadro com ≥ 90 amostras nos smokes de desempenho; água a 64k sem regressão contra o
  `develop`.
- **SC-013**: Nenhuma tarefa `- [ ]` das specs 001–033 sem estado e destino registrados.

## Assumptions

- A radiometria da 033 está correta (análise §1); a spec não refaz o modelo de luz, corrige convergência, normalização
  e custo.
- A 4090 (Linux, Vulkan, com janela) é a máquina de medida; o Mac valida depois que a spec fechar.
- O traçado de caminhos na CPU da 033 serve de referência para SC-002 e SC-003.
- Pendências das outras fases inventariadas na análise §7: entram nesta spec R1 da 011 (US7), H1–H5, G3 e as tarefas
  da 011 ligadas aos smokes e ao bench (T101, T102, T109, T110); as US4–US6, T079 e docs da 011 vão para a retomada da
  011; P/E/N/H6/G2 ficam nas fases do ROADMAP; 001 T029 bloqueada.
- Divisão dos objetos-deus (FR-022) é refatoração sem mudança de comportamento: trajetórias e fixtures bit a bit.
