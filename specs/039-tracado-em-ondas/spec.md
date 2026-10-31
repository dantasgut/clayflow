# Feature Specification: 039 refeita — água em tempo real com trabalho fixo por pixel

**Feature Branch**: `feature/039-tracado-em-ondas` (criado a partir de `feature/038-motor-puro-web`; volta para ele por
merge, nunca direto para o `develop`)

**Created**: 2026-10-29 (refeita no mesmo dia)

**Status**: Draft

**Input**: Ordem do usuário em 2026-10-29: "Você vai refazer a 39" e "E vai adotar as otimizações" — depois da crítica
de que as implementações eram ingênuas e pouco realistas, com o Particles4All (matsuoka-601) como referência. A versão
anterior desta spec (o traçado em ondas com árvore de caminhos por pixel) está no histórico do git.

## Contexto e Problema

A primeira versão da 039 tirou o material dos laços de traçado (o objetivo certo), mas manteve a árvore de caminhos
por pixel e a pôs numa fila em ondas. O resultado piorou a imagem e o tempo:

| Medido (M4, Chrome)                   | Antes da 039       | Primeira versão da 039                            |
| ------------------------------------- | ------------------ | ------------------------------------------------- |
| Refração da lente, 1280×720           | 32,6 ms            | 56,6 ms                                           |
| Fótons das cáusticas (1 M)            | 25,2 ms            | 38,8 ms                                           |
| Tanque real                           | 47,6 ms em 768×432 | água verde, pixels sem traçar (a fila estourava)  |
| Caminhos pedidos por quadro no tanque | —                  | 1,45 M para 524 k vagas; ~1 M interfaces refeitas |

O diagnóstico do pipeline da água (antes da 039):

1. O primeiro acerto da água é **marchado duas vezes por pixel**: no passe que pede a refração e de novo no traçado.
2. O campo é caro: blocos esparsos, 6 iterações de eikonal, amostra tricúbica de 64 leituras — 10,3 ms contra 2,5 ms da 033.
3. Cada pixel percorre uma árvore de até ~16 caminhos com até 34 passos; cada passo consulta a BVH e marcha o campo; no
   acerto opaco, sombra e transmissão pela água com até 8 marchas e material por trecho.

O Particles4All roda 300 mil partículas com: vizinhança por intervalos contíguos e partículas reordenadas a cada
subpasso; a malha da superfície extraída na GPU e rasterizada (o primeiro acerto sem marcha); trabalho fixo por pixel
(uma reflexão, uma refração); a profundidade óptica integrada no campo.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - O tanque em tempo real, com a imagem certa (Priority: P1)

Quem abre a cena do tanque (água, vidro, chão em xadrez, caixa submersa, espuma) vê a água refratar e refletir, a
película molhar o chão e as cáusticas no fundo, a 60 quadros por segundo no M4 a 1280×720.

**Why this priority**: é o que o usuário pede — água fluida e bonita — e é o que a primeira versão quebrou.

**Independent Test**: a cena do tanque no app e o smoke do tanque no motor: o tempo de GPU por quadro e por estágio
medido; a imagem comparada com o motor anterior à 039 na mesma posição da simulação.

**Acceptance Scenarios**:

1. **Given** o tanque a 1280×720 no M4, **When** a água assenta depois da barragem, **Then** o tempo de GPU por quadro
   fica dentro do orçamento da tabela de estágios (SC-001).
2. **Given** o mesmo instante da simulação no motor anterior e no novo, **When** se comparam as imagens, **Then** a
   água tem a mesma cor (nenhum tom verde), as ondulações aparecem na refração e o chão do tanque mostra as cáusticas.
3. **Given** a câmera girando em volta do tanque, **When** a água aparece em qualquer região da tela, **Then** todos os
   pixels de água são traçados (nenhum descartado por falta de capacidade).

### User Story 2 - O primeiro acerto da água sem marcha (Priority: P1)

A superfície da água vira uma malha na GPU a cada quadro, desenhada pela rasterização: a frente e o verso. O primeiro
acerto da câmera e a profundidade da saída saem do desenho, não de uma marcha por pixel.

**Why this priority**: a marcha dupla por pixel é o maior custo fixo da água.

**Independent Test**: o smoke da superfície compara a malha com o campo (distância dos vértices ao nível zero) e a
profundidade rasterizada com a marcha de referência; a inspeção dos kernels mostra nenhuma marcha do campo no acerto da
câmera.

**Acceptance Scenarios**:

1. **Given** uma barragem de 36 864 partículas, **When** a malha é extraída, **Then** os vértices ficam a menos de 2 % do
   voxel do nível zero do campo e a profundidade rasterizada difere da marcha de referência em menos de 1 % do voxel.
2. **Given** a capacidade da malha, **When** a superfície tem mais triângulos que ela, **Then** a capacidade cresce
   pelo evento de estouro no quadro seguinte (nenhum buraco permanente) e o estouro aparece no diagnóstico.

### User Story 3 - Luz da água com trabalho fixo por pixel (Priority: P1)

Cada pixel de água paga um número fixo de raios: a reflexão, a refração até a saída, a refração na saída e o raio para
a cena atrás. A absorção é analítica pelo comprimento dentro do meio. A dispersão abre os três canais só na saída e só
quando o meio dispersa. Nenhuma árvore de caminhos e nenhuma fila que possa estourar.

**Why this priority**: é a causa do custo e do estouro da primeira versão.

**Independent Test**: os smokes de refração com os critérios atuais nas cenas que não dependem da árvore; o custo da
lente medido; o tanque sem verde.

**Acceptance Scenarios**:

1. **Given** as cenas de refração do smoke, **When** traçadas pelo novo estágio, **Then** os erros por região ficam
   dentro dos critérios atuais (sem afrouxar); a cena que exigir mais interfaces que o orçamento fixo é registrada como
   decisão do usuário, não ajustada em silêncio.
2. **Given** a lente a 1280×720, **When** medida, **Then** a refração custa até 3 ms (o critério que já existia).
3. **Given** qualquer cena, **When** o estágio roda, **Then** o número de raios por pixel e de despachos por quadro é
   fixo (não depende do conteúdo).

### User Story 4 - Material fora dos laços de traçado (Priority: P2)

O objetivo da primeira versão continua: os kernels de traçado não contêm função `material`; cada material é avaliado
por um kernel próprio sobre os acertos de um estágio (a onda, agora com tamanho fixo: pixels × raios do estágio).

**Independent Test**: a inspeção dos kernels gerados; os smokes de GI e cáusticas com os critérios atuais.

### User Story 5 - Simulação com a vizinhança coerente (Priority: P2)

A busca de vizinhos do PBF passa a varrer intervalos contíguos (9 por partícula em vez de 27 células), com as partículas
reordenadas pela célula a cada subpasso.

**Independent Test**: os smokes de física com os critérios atuais; o tempo do passo medido antes e depois.

### User Story 6 - O tempo de cada estágio sempre à vista (Priority: P1)

O motor mede o tempo de GPU de cada passe com consultas de tempo, sem leitura que trave o quadro, e publica a média por
estágio num recurso; o app mostra a tabela.

**Independent Test**: com a consulta de tempo disponível, a tabela por estágio do tanque é gravada no `baseline.md`; sem
ela, nada quebra.

### Edge Cases

- Câmera dentro da água: o verso desenhado vira a entrada; o raio da câmera começa no meio.
- Água fina (película, gotas): a frente e o verso coincidem; a absorção usa a espessura real (a diferença das
  profundidades), nunca negativa.
- Várias camadas de água na mesma linha (onda quebrando): o orçamento fixo cobre a primeira entrada e a primeira saída;
  depois da saída, o raio para a cena pode acertar água de novo e usa a absorção da espessura rasterizada daquele pixel
  de volta (registrado como limite medido, não escondido).
- Dispositivo sem consulta de tempo: a medição se desliga; o resto funciona.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Medição de GPU por passe sempre disponível (consultas de tempo, anel de leitura assíncrona), com a média
  por estágio num recurso do motor.
- **FR-002**: Malha da superfície da água extraída na GPU a cada quadro do campo (tetraedros marchantes), com vértices
  compactos e desenho indireto; capacidade que cresce por evento.
- **FR-003**: Frente e verso da malha rasterizados num alvo por pixel (profundidade e normal da entrada, profundidade e
  normal da saída) que substitui o pedido do volume por marcha.
- **FR-004**: Estágio da água com raios fixos por pixel: reflexão; refração na entrada (normal do raster com a
  ondulação do material); refração na saída; raio para a cena; absorção analítica pelo comprimento; dispersão de três
  canais só na saída, só quando o meio dispersa.
- **FR-005**: Os transmissivos de malha (vidro) com o mesmo estágio de raios fixos: entrada e saída por raio, o mesmo
  orçamento.
- **FR-006**: Material avaliado fora dos kernels de traçado, por classe, numa onda de tamanho fixo por estágio.
- **FR-007**: Vizinhança do PBF por intervalos contíguos com reordenação física a cada subpasso.
- **FR-008**: Nenhuma fila de tamanho dependente do conteúdo no caminho da água; nenhum laço sem teto (a regra dura da
  GPU).
- **FR-009**: Resource + evento + Flow; adaptativo pelo adaptador; nada na CPU; multiplataforma.

### Key Entities

- **GpuTiming**: a média do tempo de GPU por estágio.
- **FluidSurfaceMesh**: os vértices da superfície de cada quadro, a contagem, a capacidade.
- **WaterLayers**: o alvo por pixel com a entrada e a saída da água (profundidade e normal).
- **WaterLight**: os raios fixos por pixel e o resultado (radiância, fim, albedo, movimento) nos alvos atuais da refração.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: O tanque (36 864 partículas, 1280×720, M4, Chrome) com GPU ≤ 16,7 ms por quadro, nos orçamentos:
  física ≤ 4 ms; campo + malha + raster ≤ 3 ms; luz da água e do vidro ≤ 4 ms; cáusticas ≤ 2 ms; o resto (forward,
  sombras, espuma, filtro temporal) ≤ 3,7 ms. Medido pela FR-001 e registrado no `baseline.md`.
- **SC-002**: A refração da lente a 1280×720 custa ≤ 3 ms.
- **SC-003**: A imagem do tanque comparada com o motor anterior à 039 no mesmo instante: a cor média da água por canal a
  menos de 5 % e nenhum pixel de água sem traçar.
- **SC-004**: Os smokes de refração, cáusticas, GI e física com os critérios atuais; a cena que exigir o que o
  orçamento fixo não cobre vai para decisão do usuário, com a medida.
- **SC-005**: Zero funções `material` nos kernels de traçado.
- **SC-006**: Vídeo do tanque gravado no Chrome e no Deno (com aprovação), sem travar a GPU.

## Assumptions

- O meio de cada corpo de água é homogêneo (decisão do usuário: "Meio por corpo").
- A ondulação vem do material na normal da entrada (pelo raster) e da saída.
- As cáusticas mantêm 65 536 fótons por quadro por padrão.
- O orçamento fixo cobre uma entrada e uma saída da água por pixel; o que passa disso é medido e levado ao usuário.

---

## Emenda 2026-10-30 — o renderizador e o espaço de trabalho gerenciado

**Input**: decisões do usuário em 2026-10-30: "Refraction é uma propriedade de material, não é um resource por si
próprio, vide o Blender"; "O 3 [o espaço de trabalho por quadro] também cabe em um renderizador"; "Siga com
desempenho, depois unificamos o renderizador, incluindo estes flows que você escreveu"; e, depois do mapa dos custos e
dos botões de qualidade (`baseline.md`), "Façamos uma emenda na 39 e façamos aqui o render".

### Contexto da emenda

1. **Não há configuração de renderização.** Ela está espalhada em Resources avulsos inseridos pelos estágios padrão
   (`ToneMapping`, `FrameTargets`, `TemporalAntialiasing`, `TemporalFilter`, `Refraction`, `Caustics`); o `Refraction`
   mistura um limite de caminho de luz com o espaço de trabalho do traçado, e a refração em si já é do material (o
   fechamento do grafo: transmissão, IOR, Abbe, absorção).
2. **O espaço de trabalho fica fora da arquitetura.** Quase todos os Flows e os auxiliares deles (`RayWave`,
   `PerStepUniforms`, `FrameUniforms`, `PrefixSum`, `RadixSort`, `SpatialHashGrid`, `CountToArgs`, `ColliderSet`,
   `NeighborSearchPipeline`…) criam buffers e texturas por `core.create`, contra o Princípio III da constituição
   (alocação só pelo `ResourceSystem`). Consequências medidas: os buffers das cáusticas só crescem (depois de 262 144
   fótons, 65 536 custam 31 ms em vez de 22,5) e desligar e religar os fótons deixa as cáusticas ~7 ms mais caras.
   Faltam na C2 as peças que tornariam isso desnecessário: buffer dimensionado pela tela (só texturas têm
   `sizeFromCanvas`), leitura de volta entregue por evento e uniformes por região com offset dinâmico.
3. **O orçamento de 16,7 ms (SC-001) não fecha na fidelidade atual.** Medido: 33 ms com a física (22 ms congelado); os
   botões de qualidade dão no máximo 1,3–1,6× (`baseline.md`, "Os botões de qualidade"); o trabalho distribuído entre
   quadros (Opção B) leva a ~60 FPS a 1280×720.

### User Story 7 - Um renderizador com a configuração do desenho (Priority: P1)

Quem monta uma cena configura o desenho num lugar só — os limites dos caminhos de luz (como o Light Paths do Cycles), as
cáusticas, o antisserrilhado, o filtro temporal, a saída — e escolhe um perfil de qualidade; a refração de cada objeto
vem do material dele.

**Independent Test**: a cena do tanque com cada perfil no app e no smoke; os testes de unidade do `Renderer` (valores,
validação, perfis); nenhum `Refraction` nem `Caustics` na API de autoria.

**Acceptance Scenarios**:

1. **Given** uma cena com material transmissivo, **When** ela é montada sem configurar nada, **Then** o renderizador
   padrão entra com o perfil alto (a imagem e o tempo de hoje).
2. **Given** o perfil médio ou baixo, **When** escolhido em tempo de execução, **Then** o quadro seguinte usa os
   limites dele e o espaço de trabalho se ajusta (cresce e encolhe) sem vazamento: o custo de um perfil não depende
   dos perfis usados antes.
3. **Given** o teto de interfaces de transmissão, **When** alterado, **Then** o traçado o segue (o mesmo efeito do
   `maxInterfaces` de hoje) e a refração de cada objeto continua vindo do material.

### User Story 8 - Todo espaço de trabalho gerenciado pela C2 (Priority: P1)

Nenhum Flow nem auxiliar de C3/C4 cria buffer ou textura: o espaço de trabalho é declarado como descritor do Resource
dono (o renderizador, o campo, a estrutura de raios, a física de cada corpo), dimensionado pela tela, pela capacidade
pedida ou pela configuração, alocado, religado e liberado pela C2 com eventos.

**Independent Test**: uma regra de lint (e um teste que a confere) sem `core.create` em `src/elements` e
`src/presentation`; os smokes com os critérios atuais; o teste de crescer, encolher e redimensionar sem vazamento.

**Acceptance Scenarios**:

1. **Given** o canvas redimensionado, **When** o quadro seguinte roda, **Then** os buffers e texturas dimensionados
   pela tela já têm o tamanho novo e as ligações foram refeitas pela C2.
2. **Given** um contador da GPU que precisa ser lido (a fila da refração, os contatos do LCP), **When** a leitura fica
   pronta, **Then** o Flow a recebe por evento, sem `mapAsync` nem buffer de leitura próprio.
3. **Given** uma capacidade que muda para baixo (menos fótons, perfil menor), **When** o Resource se redescreve, **Then**
   a memória e o custo voltam aos do tamanho novo.

### User Story 9 - Perfis e trabalho distribuído entre quadros (Priority: P1)

O tanque roda mais rápido sem quebrar as regras do motor (nada de imagem no lugar de raio): perfis de qualidade e o
trabalho caro distribuído entre quadros — cáusticas acumuladas e refeitas no passo da física, caminhos de luz que
continuam no quadro seguinte, metade dos representantes traçada por quadro em xadrez.

**Independent Test**: a ablação do tanque congelado e com a física (`baseline.md`) por perfil e por peça; a imagem
contra a referência e contra o piso de ruído; os smokes de refração e cáusticas com os critérios atuais.

**Acceptance Scenarios**:

1. **Given** o tanque com a física a 1280×720 no M4, **When** medido por perfil, **Then** os tempos ficam nos alvos da
   SC-009 e a diferença de imagem de cada perfil contra o alto fica registrada.
2. **Given** a câmera parada e a água assentada, **When** a peça distribuída está ligada, **Then** a imagem converge
   para a mesma do perfil sem ela (diferença no piso de ruído).
3. **Given** a câmera girando ou a água agitada, **When** a peça distribuída está ligada, **Then** o atraso e o rastro
   medidos ficam registrados; a peça que passar dos limites da SC-010 fica desligada no perfil e vai ao usuário.

### Edge Cases da emenda

- Perfil trocado no meio da simulação: o espaço de trabalho se redescreve; os históricos temporais que dependem do
  tamanho são invalidados pela C2 (como os canais temporais).
- Leitura de volta mais lenta que o quadro: uma em voo por descritor; o Flow usa a última recebida (como a fila da
  refração já faz).
- Sem consulta de tempo ou sem leitura de volta: os perfis funcionam; a fila da refração usa a capacidade inteira.
- A Opção A (a água pela tela, como o Particles4All: profundidade suavizada na tela e espessura no lugar do caminho) fica
  fora: quebra as regras "sem desfoque de tela" e "sem imagem no lugar de física"; só entra como perfil com exceção
  decidida pelo usuário.

### Functional Requirements da emenda

- **FR-010**: Um `Renderer` (C3, `src/elements/render/`): fachada de autoria com os limites dos caminhos de luz
  (transmissão, reflexão), as cáusticas (fótons, célula, frequência), o traçado (resolução, xadrez, continuação), o
  antisserrilhado, o filtro temporal e a saída; perfis `high`/`medium`/`low` que preenchem os valores; inserido pelos
  estágios padrão; um por cena (o renderizador por alvo de render fica para a 014, com a mesma forma).
- **FR-011**: `Refraction` e `Caustics` deixam de ser Resources de autoria: a configuração vai ao `Renderer`, o espaço
  de trabalho aos Resources de trabalho dele; a refração de cada objeto continua no material.
- **FR-012**: C2 — buffer dimensionado pela tela: um descritor de buffer declara bytes por elemento da tela (com
  divisor), alocado e recriado pela C2 no `canvasReconfigured`, como as texturas `sizeFromCanvas`.
- **FR-013**: C2 — leitura de volta por descritor: o Resource declara que um descritor é lido de volta; a C2 copia,
  mapeia (uma em voo por descritor) e entrega os bytes por evento aos Flows com slot no Resource.
- **FR-014**: C2 — uniformes por região: um descritor uniforme com N regiões e offset dinâmico, com o dado de cada
  região no Resource e a reserva por redescrição (o que o `PerStepUniforms` e o `FrameUniforms` fazem hoje).
- **FR-015**: Os auxiliares de compute e de raios (`RayWave`, `PrefixSum`, `RadixSort`, `Compaction`, `Reduce`,
  `SpatialHashGrid`, `CountToArgs`, `ColliderSet`, `NeighborSearchPipeline`, `GraphColorer`, `UiGpuPipeline`,
  `SetNodeKernels`) passam a declarar os descritores de que precisam (para o Resource dono incluir) e a ligar o que a C2
  alocou; nenhum cria objeto de GPU.
- **FR-016**: Os Flows de desenho (refração, cáusticas, GI, campo, estrutura de raios, forward, sombras, partículas,
  pós, interface) e os de simulação e cena (LCP, PBF, SPH, MPM, FEM, XPBD, difusas, emissores, colisores de superfície,
  superfícies macias, transformações, câmeras, matriz de sombra, superfícies) sem `core.create`: o espaço de trabalho
  nos Resources donos.
- **FR-017**: A capacidade segue a configuração nos dois sentidos (cresce e encolhe), sem estado preso a valores
  anteriores (corrige os dois defeitos das cáusticas).
- **FR-018**: Opção B: cáusticas com fótons e média móvel pela configuração e refeitas só no passo da física (B3);
  caminhos que continuam no quadro seguinte, com as vagas vivas preservadas e a reprojeção pelo filtro temporal (B1);
  metade dos representantes por quadro em xadrez (B2); cada peça ligada por perfil.
- **FR-019**: Uma regra de lint proíbe `core.create` em `src/elements/**` e `src/presentation/**` (testes e smokes
  fora), como a regra de importação da constituição.

### Key Entities da emenda

- **Renderer**: a configuração do desenho e o perfil; dono dos Resources de trabalho do desenho.
- **RenderWorkspace** (por estágio: refração, cáusticas, GI, pós, desenho por grupo): os descritores do espaço de
  trabalho, dimensionados pela tela, pela capacidade ou pela configuração.
- **ReadbackDescriptor** / evento `bufferRead`: a leitura de volta gerenciada.
- **UniformRegions**: o descritor uniforme por região com offset dinâmico.

### Success Criteria da emenda

- **SC-001 e SC-002 (substituídos, decisão do usuário 2026-10-30)**: o orçamento de 16,7 ms do tanque e os 3 ms da
  lente não fecham na fidelidade atual (medido em `baseline.md`); passam a ser medidos por perfil pela SC-009. As
  medidas de antes e depois ficam registradas.
- **SC-007**: Zero `core.create` em `src/elements` e `src/presentation` (lint + teste).
- **SC-008**: Os smokes e testes que passam hoje continuam passando; as falhas anteriores registradas no
  `baseline.md` não pioram; o custo de cada perfil não depende dos usados antes (teste de vazamento).
- **SC-009**: O tanque com a física a 1280×720 no M4 (Chrome): alto ≤ 33 ms (o atual, sem regressão); médio ≤ 22 ms;
  baixo ≤ 17 ms — com a Opção B nos perfis em que ela passa a SC-010.
- **SC-010**: Cada peça da Opção B com a câmera parada converge para a imagem sem ela (diferença no piso de ruído:
  ≤ 0,6 % dos pixels > 8/255); com a câmera girando e a água agitada, o atraso e o rastro medidos e registrados.
- **SC-011**: O vídeo do tanque em cada perfil no Chrome.

### Assumptions da emenda

- A migração não muda a imagem: com o perfil alto e a Opção B desligada, as capturas ficam no piso de ruído das
  atuais.
- Os perfis e os alvos da SC-009 vêm das medidas de 2026-10-30; um alvo que não fechar vai ao usuário com a medida.
