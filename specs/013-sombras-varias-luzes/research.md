# Research: Sombras para várias fontes de luz

Levantamento do código em 2026-11-24 (`develop` 9b01c88b), só leitura. Cada decisão: o que foi escolhido, por quê, e o
que foi descartado.

## R1 — O que hoje supõe uma luz só

**Achado**: cada `DirectionalLight` com `castShadow` cria o seu `ShadowMap` (`DirectionalLight.ts:36-37`), com atlas,
pedidos e slot de matriz próprios (`ShadowMap.ts:198-232`). O `ShadowMatrixFlow` já percorre todas
(`ShadowMatrixFlow.ts:124-177`), e os módulos de visibilidade e de espessura já são gerados por par `(lightSlot,
shadowSlot)` e combinados (`shadowContribution.ts:15-97`, `lighting.ts:204-242`). Presos ao primeiro mapa:

- `ShadowFlow` (slots `caster`, `requests`, `atlas` por `select`; um `ShadowWork`; um `casterSlot`; um passe de compute
  e um de desenho; a chave fixa `LIGHT_VIEW`) — `ShadowFlow.ts:65-66, 166, 262-323, 358-375, 657, 743, 856-883`.
- `ShadowRequestFlow` (`:92-97, 150-165`).
- O binding global `shadow_atlas` (`resources.ts:141-147`), ligado pelo `ShadowCasterResolver` ao primeiro mapa
  (`shadowCaster.ts:38-47`), lido direto por `shadow_virtual_read.wgsl:10, 27, 48, 174` e
  `shadow_virtual_thickness.wgsl:15`.

**Efeito**: a segunda luz usa a matriz dela sobre o atlas da primeira; o atlas dela (69,5 MB no perfil alto) é alocado
e nunca escrito.

## R2 — Um atlas para todas as luzes

**Decisão**: um Resource de cena `ShadowAtlas` (um por cena, criado com a primeira luz com sombra) guarda as páginas
físicas, as tabelas e os pedidos de todas as vistas de sombra. Cada vista (R3) recebe uma **faixa** da tabela e dos
pedidos; as páginas físicas são um reservatório comum. A `ShadowMatrix` da vista ganha `tableBase` e `requestBase`
(palavras), e `sv_table_word`/`sv_request_word` somam a base. O binding global `shadow_atlas` continua um só.

**Racional**:

- A regra do projeto: atlas, arena e páginas, nunca estrutura paralela equivalente (FR-016).
- Memória: um atlas por luz custa 69,5 MB cada no perfil alto e a maior parte fica vazia; o reservatório comum dá as
  páginas a quem pede.
- Bindings: o forward tem teto de 10 buffers de storage por estágio (piso M3/Chrome) e já usou 11 antes das arenas
  (`specs/034-refracao-fisica/tasks.md:380`). Um binding por luz não cabe.
- As funções `sv_*` já recebem só a `ShadowMatrix`: a base por vista entra por ela, sem parâmetro novo.

**Descartado**: um binding por luz (estoura o teto); um atlas por luz dentro de uma arena de buffers (resolve o
binding, mantém a memória por luz e a alocação fixa por luz).

## R3 — A vista de sombra como unidade

**Decisão**: a unidade do trabalho é a **vista de sombra**: um referencial (matriz e projeção), uma faixa da tabela,
uma faixa dos pedidos. Uma luz direcional tem 1 vista (ortográfica, níveis em volta da câmera, como hoje); uma de foco,
1 vista em perspectiva; uma pontual, 6 vistas em perspectiva (as faces do cubo). O `ShadowMap` passa a declarar as suas
vistas; o `ShadowFlow` e o `ShadowRequestFlow` percorrem a lista de vistas vivas com teto constante.

**Racional**: os kernels de páginas já são parametrizados pela matriz; o que muda de uma luz para outra é o referencial
e a base. Tratar a face de um cubo como mais uma vista evita um segundo caminho para as pontuais.

**Teto**: 16 vistas no perfil alto, 8 no médio, 4 no baixo (R9), ajustado ao adaptador. No alto: 4 direcionais + 2
pontuais, ou 16 de foco, por exemplo.

**Descartado**: mapa de cubo em textura para as pontuais (estrutura paralela, sem cache por página nem orçamento
comum); parabolóide duplo (distorção, emenda).

## R4 — Vistas em perspectiva (foco e pontual)

**Decisão**: na vista em perspectiva os níveis são níveis de resolução do mesmo tronco (como os mips de um mapa
virtual): o nível de um ponto sai do tamanho do pixel da câmera projetado na vista (o texel da sombra próximo do pixel
da tela), em vez da distância à câmera. A profundidade guardada é a linear ao longo do eixo da vista; a comparação, o
bias pelo plano receptor e a penumbra (busca de bloqueadores com o raio da fonte) seguem os da direcional, com a
escala do texel pela distância.

**Racional**: mapas de sombra virtuais com níveis por resolução são a prática corrente para luzes locais (Unreal 5,
"Virtual Shadow Maps"); mantém o cache por página, que é o que torna barata uma luz local parada.

**A conferir na implementação**: o recorte das instâncias por página numa vista em perspectiva (`sp_rect` hoje é do
plano ortográfico da luz: `ShadowFlow.ts:297`) e o `near` da vista.

## R5 — Luzes de área

**Decisão**: a sombra da luz de área é calculada por **raios contra a estrutura de raios da cena**, num passe em
compute por pixel visível: para cada luz de área com sombra, raios do ponto a pontos sorteados no retângulo
(`ray_scene_occluded`), a fração dos que chegam; o resultado é uma série do canal temporal (037) por luz de área,
filtrada pelo `TemporalFilter` (média reprojetada, gradiente temporal, à-trous guiado) e lida por `light_visibility`.

**Racional**:

- FR-006 pede a fração da fonte visível de cada ponto. Um mapa de sombra visto do centro do retângulo com penumbra por
  busca de bloqueadores aproxima bem o contato e erra a penumbra de fontes grandes e de oclusores entre a fonte e o
  receptor em profundidades diferentes; o critério SC-003 (5 % contra a referência) não fecha com ele.
- "Calcular, não tabelar" e "AAA sem falsear": a visibilidade de uma fonte extensa é uma integral sobre a fonte; raios
  a amostram direto.
- O que é preciso já existe: `ray_scene_occluded` (`ray_scene.wgsl:229-231`), o padrão de passe por pixel com fila
  compacta e despacho indireto (`RefractionFlow.ts:157-170`) e o filtro temporal (`TemporalFilter.ts:57-67`). A sombra
  por raio da luz de área já é feita nos acertos dos raios, pelo centro (`ray_direct.wgsl:23-40`).
- É uma segunda forma de calcular sombra, mas não uma estrutura paralela equivalente: resolve outra grandeza (a
  visibilidade de uma fonte extensa) com a estrutura de raios que a cena já tem. Registrado em Complexity Tracking.

**Custo previsto**: meia resolução, 1 raio por pixel por luz por quadro, acumulado no tempo; teto de 4 luzes de área
com sombra no perfil alto (2 no médio, 1 no baixo). Medir antes de fixar (SC-008: 3 ms por luz).

**Especular**: a mesma visibilidade multiplica o lobo especular da fonte (FR-007); a diferença entre a visibilidade
média da fonte e a da parte que o lobo vê fica registrada como pendência com a medida.

**Descartado**: mapa de sombra do centro com PCSS (acima); integrar a oclusão analiticamente contra a geometria
(inviável para malhas gerais).

## R6 — A luz que atravessa (espessura) por luz

**Decisão**: `light_thickness` passa a valer por vista: as direcionais, de foco e pontuais leem a espessura do seu mapa
(já parametrizado pela matriz); a combinação das contribuições deixa de ser "a última que conhece" e passa a ser por
luz (cada módulo responde só pela sua luz, como `light_visibility`). Para a luz de área, a espessura sai do mesmo passe
de raios: a distância do ponto, pelo lado de dentro, até a saída do corpo na direção do centro da fonte.

**Racional**: `lighting.ts:204-225` hoje fica com o último módulo que conhece a espessura; com duas luzes, uma apaga a
outra. A correção do #54 (espessura só pelo nível de página do ponto) continua valendo por vista.

## R7 — Orçamento repartido

**Decisão**: o orçamento de páginas por quadro (`SHADOW_PAGE_BUDGET`) é um só para todas as vistas. A fila de alocação
ordena por nível (do mais grosso ao mais fino) **entre** as vistas: primeiro a reserva grossa de cada vista, depois os
níveis seguintes de todas, em rodízio. No quadro em que uma vista recomeça o cache (a luz girou, R do #54), ela leva o
que pedir até o teto do reservatório; as demais mantêm o que têm.

**Racional**: FR-017 — o que não coube num quadro aparece como sombra menos fina (o nível grosso), nunca errada; uma
luz girando não tira as páginas das paradas.

**Reservatório**: `atlasPages` passa a depender do número de vistas vivas e do perfil, com teto pelo
`maxStorageBufferBindingSize` do adaptador (FR-020); medido, não fixo por máquina.

## R8 — Aviso

**Decisão**: a cena emite o evento `shadowUnavailable` (com a entidade da luz e o motivo: `limit` ou `kind`) quando uma
luz pede sombra e fica fora das vistas vivas; a luz ilumina sem sombra (a contribuição dela não é composta). O app
padrão o leva ao console uma vez por luz. `RectLight` passa a aceitar `castShadow`.

**Racional**: FR-012/FR-013; o motor já tem eventos de recusa (`extensionRejected`). A ordem de quem fica com sombra é
a de inserção, estável.

## R9 — Tetos por perfil

| Perfil | Vistas em páginas | Luzes de área com sombra | Páginas físicas (teto) |
| ------ | ----------------- | ------------------------ | ---------------------- |
| alto   | 16                | 4                        | 48 × 48                |
| médio  | 8                 | 2                        | 32 × 32                |
| baixo  | 4                 | 1                        | 16 × 16                |

Valores de partida, ajustados pela medida (SC-007 a SC-009) e pelo adaptador.

## R10 — Reflexos e luz rebatida

**Achado**: os acertos dos raios (GI, refração, reflexo traçado) já calculam a sombra de qualquer luz por raio
(`ray_direct.wgsl:23-89`), sem depender do mapa. FR-022 já vale ali; a luz de área é amostrada pelo centro.

**Decisão**: manter; registrar a luz de área pelo centro nos acertos como pendência com a medida.

## R11 — Vista da luz da malha adaptativa

**Achado**: a `ParametricSurface` produz uma malha por vista; a da luz usa a chave fixa `LIGHT_VIEW = 'light'`
(`ShadowFlow.ts:166, 910`), embora o `SurfaceFlow` já resolva o slot pela `source` (`SurfaceFlow.ts:1036`).

**Decisão**: a chave passa a ser por vista de sombra, com teto de vistas de malha por superfície; acima dele a
superfície usa a malha da câmera para as vistas restantes (como a deslocada já faz hoje).

## R12 — Verificação

- **Soma** (SC-001): `shadow-sum` — três direcionais com sombra contra a soma de três imagens de uma luz.
- **Movimento** (SC-002): um caso `*-travel` por tipo de luz, o último quadro contra o estado parado (a regra de teste
  nova: recurso com cache entre quadros tem caso com a entrada mudando a cada quadro).
- **Luz de área** (SC-003): referência f64 `reference/rectVisibility.ts` — a fração do retângulo visível de um ponto
  com oclusores de forma fechada (meio-plano, esfera), por quadratura; caso `rect-shadow`.
- **Foco e pontual**: `spot-shadow`, `point-shadow` — a borda da sombra contra a posição geométrica.
- **Subsuperfície** (SC-005): `subsurface-two-lights` no smoke `materials`.
- **Aviso** (SC-006): `shadow-limit`.
- **Tempo** (SC-007 a SC-009): `shadow-timing`, com 1 a 4 direcionais, paradas e em movimento, e 1 luz de área.
- **Retrato** (SC-004): as cenas `pele-rosto-*` do claflow-web, medidas num quadro gravado.
- **Sem regressão** (SC-010): os smokes `lighting`, `sky`, `clouds`, `fog`, `materials`, `globalIllumination`,
  `refraction`, `parametricSurfaces`, `antialiasing`, `render`, `rayScene` — que também não foram rodados depois do #54.
