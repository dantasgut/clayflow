# Feature Specification: Superfícies paramétricas completas

**Feature Branch**: `feature/010-parametric-surfaces`

**Created**: 2026-10-15

**Status**: Draft

**Input**: User description: "Superfícies paramétricas completas (spec 010, fase F3 do roadmap —
`010-parametric-surfaces`). Fecha a F3 sobre o que a 009 entregou (ParametricSurface avaliada na GPU por
SurfaceFunction/pronta, normais por derivadas analíticas ou numéricas, homotopias, space). Escopo conforme ROADMAP §5
F3: (1) geometria diferencial na GPU: métrica (primeira forma fundamental E, F, G), segunda forma, curvaturas
gaussiana, média e principais por vértice, disponíveis ao material (SurfaceSample) e a quem ler a superfície; (2) malha
adaptativa guiada pela métrica/curvatura e pela distância à câmera, produzida em compute sem leitura de volta, com o
desenho acompanhando a contagem (indireto ou equivalente), sem rachaduras entre níveis, mantendo a malha uniforme da
009 como modo padrão; (3) colisor derivado da superfície: heightfield para superfícies-gráfico (terreno) e SDF amostrado
para superfícies gerais, produzidos na GPU, consumidos pelos colliders existentes (corpos rígidos e partículas
SPH/PBF/MPM/XPBD pela fronteira genérica ColliderHit da 030), atualizados quando a superfície muda/anima; (4)
ParametricGeometry de CPU com normais corretas (hoje [0,1,0]) ou unificada com a ParametricSurface. Requisitos gerais:
Resource + evento + Flow, sem helpers; motor agnóstico (C3/C4 não importam a C1; architecture_resource_loaders.md
autoritativo); sem superfícies ⇒ fixtures bit a bit; mesma trajetória a 30/60/144 Hz; sem leitura de volta por quadro;
bench sem regressão e baseline regravado; smokes com medidas (curvatura de esfera/toro contra a analítica,
adaptatividade, colisão de corpos e fluido no terreno e numa superfície geral), inclusive --dist; npm run ci verde;
vídeos (terreno paramétrico colidível com corpos e fluido; superfície deformando com malha adaptativa; curvatura no
material) para o usuário. Critério do ROADMAP: superfícies paramétricas deformadas em tempo real com normais corretas;
terreno paramétrico colidível. Fora de escopo: espaço curvo aplicado à cena/portais (019), texturas (012), PBR (011),
streaming de terreno (021)."

## Contexto e Problema

A 009 deixou a superfície paramétrica avaliada na GPU: grade uniforme u × v, posição, normal por derivadas (analíticas
ou numéricas), uv, homotopias e o espaço da cena aplicado. Falta o que a F3 promete (levantamento na `develop` após o
PR #44):

| Lacuna                       | Estado atual (evidência)                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sem geometria diferencial    | O kernel da superfície calcula só as tangentes para a normal; métrica, segunda forma e curvaturas não existem; o material recebe posição, normal, uv e tempo           |
| Malha só uniforme            | `ParametricSurface` tem resolução fixa da construção; regiões planas e regiões muito curvas recebem a mesma densidade, perto e longe da câmera                         |
| Superfície não colide        | Nada colide com uma `ParametricSurface`: corpos e fluidos atravessam o terreno; o conjunto de colliders só tem plano, caixa, esfera e malha (a malha não gera contato) |
| Geometria paramétrica da CPU | `ParametricGeometry`/`ParametricSurfaceGeometry` amostram uma função JS com normais fixas `[0, 1, 0]` (iluminação errada em qualquer superfície que não seja plana)    |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Terreno paramétrico colidível (Priority: P1)

Quem monta uma cena cria um terreno por função (pronto por ruído ou uma `SurfaceFunction`) e marca a superfície como
colidível. Corpos rígidos rolam e pousam sobre ele, fluidos escorrem pelas encostas e se acumulam nos vales, partículas
de emissores e corpos moles também param sobre ele — sem atravessar. Se o terreno anima (homotopia, deformação), o
colisor acompanha.

**Why this priority**: é o critério do ROADMAP para a F3 ("terreno paramétrico colidível") e o que mais muda o uso: a
superfície deixa de ser só visual.

**Independent Test**: um terreno por ruído com esferas e caixas soltas sobre ele e um bloco de fluido; medir que nada
fica abaixo da superfície e que os corpos repousam sobre ela.

**Acceptance Scenarios**:

1. **Given** um terreno colidível (gráfico y = h(x, z)) e 50 corpos rígidos soltos sobre ele, **When** a cena corre
   6 s, **Then** nenhum corpo fica abaixo da superfície mais que a folga de contato, e ≥ 95 % dos corpos repousam
   (velocidade < 0,05 m/s).
2. **Given** o mesmo terreno e um bloco de fluido (SPH, PBF e MPM, cada um), **When** corre 4 s, **Then** nenhuma
   partícula fica abaixo da superfície, e o centróide do fluido desce para a região mais baixa (vale) do terreno.
3. **Given** um terreno que anima (altura que sobe e desce no tempo), **When** um corpo repousa sobre ele, **Then** o
   corpo acompanha a superfície (não a atravessa nem fica flutuando além da folga).
4. **Given** uma cena sem superfícies colidíveis, **When** corre, **Then** as trajetórias são idênticas, bit a bit, às
   atuais.

---

### User Story 2 - Superfície geral colidível (Priority: P1)

Uma superfície que não é gráfico (esfera, toro, tubo, homotopia) também pode ser marcada como colidível: corpos e
fluidos colidem com ela por fora (e por dentro, quando fechada), com a mesma fronteira usada pelos outros colliders
(adesão da 030 inclusive).

**Why this priority**: completa o colisor "SDF derivado da superfície" do ROADMAP e é a base dos colisores de fluido
da F5 (015/016).

**Independent Test**: um toro colidível com esferas e um fluido caindo sobre ele; medir a distância das partículas à
superfície.

**Acceptance Scenarios**:

1. **Given** um toro colidível e corpos caindo sobre ele, **When** a cena corre, **Then** nenhum centro de corpo entra
   no toro além da folga, e os corpos escorregam e caem pelo furo central ou repousam sobre ele.
2. **Given** um fluido caindo sobre uma esfera colidível, **When** corre, **Then** o fluido escorre pela esfera sem
   atravessá-la (nenhuma partícula com distância negativa além de meio espaçamento).
3. **Given** um fluido com adesão (030) sobre a superfície, **When** corre, **Then** a adesão age sobre ela como sobre
   os outros colliders.

---

### User Story 3 - Geometria diferencial e malha adaptativa (Priority: P2)

O material e quem lê a superfície recebem a geometria diferencial por ponto: métrica (o quanto a parametrização estica
cada direção), curvaturas gaussiana, média e principais. Com isso, um material pode colorir por curvatura, e a malha
pode ser adaptativa: mais triângulos onde a superfície curva mais e perto da câmera, menos nas regiões planas e
distantes — sem rachaduras entre regiões de densidades diferentes. A malha uniforme da 009 continua o padrão.

**Why this priority**: entrega a "matemática de superfícies" da F3 e reduz o custo de superfícies grandes, mas não é
pré-requisito do uso colidível.

**Independent Test**: esfera e toro com as curvaturas medidas contra as analíticas; um terreno com malha adaptativa
vista de perto e de longe, contando triângulos e verificando a ausência de rachaduras.

**Acceptance Scenarios**:

1. **Given** uma esfera de raio r, **When** a geometria diferencial é avaliada, **Then** a curvatura gaussiana é 1/r² e
   a média 1/r em todos os vértices fora dos polos (erro ≤ 1 %), por derivadas analíticas e numéricas.
2. **Given** um toro de raios R e r, **When** é avaliado, **Then** a curvatura gaussiana segue cos v / (r (R + r cos
   v)) (erro ≤ 2 %), positiva por fora e negativa por dentro.
3. **Given** um material que colore pela curvatura, **When** desenha o toro, **Then** a parte externa e a interna têm
   cores diferentes conforme o sinal da curvatura gaussiana.
4. **Given** uma superfície adaptativa, **When** a câmera se aproxima de uma região, **Then** essa região recebe mais
   triângulos e as distantes menos; o total de triângulos fica abaixo da malha uniforme de mesma precisão máxima.
5. **Given** a malha adaptativa, **When** é desenhada, **Then** não há frestas entre regiões de níveis diferentes
   (nenhum pixel de fundo atravessa a superfície fechada).
6. **Given** a malha adaptativa, **When** ela muda (câmera, deformação), **Then** nada é lido de volta da GPU e o
   desenho usa a contagem produzida na GPU.

---

### User Story 4 - Geometria paramétrica da CPU correta (Priority: P3)

Quem ainda usa a geometria paramétrica de CPU (função JavaScript amostrada) recebe normais corretas, e a relação entre
ela e a superfície da GPU fica clara (uma delas é o caminho recomendado; a outra não ilumina errado).

**Why this priority**: corrige um defeito visível, mas tem caminho alternativo já entregue (a superfície da GPU).

**Independent Test**: uma esfera pela geometria de CPU; medir as normais contra a radial.

**Acceptance Scenarios**:

1. **Given** a geometria paramétrica de CPU de uma esfera, **When** é criada, **Then** as normais coincidem com a
   radial (≤ 1°).
2. **Given** uma geometria de CPU existente usada pelos smokes atuais, **When** desenhada, **Then** as imagens das
   fixtures que dependem dela mudam só pelas normais corrigidas (listadas para aprovação).

---

### Edge Cases

- Superfície colidível com a parametrização degenerada (polo): a distância continua definida (vem da forma, não da
  parametrização).
- Corpo mais rápido que a espessura de amostragem do colisor: o colisor tem uma folga e o passo estável continua o dos
  solvers; corpos muito rápidos podem atravessar como hoje com paredes finas (documentado).
- Superfície aberta (plano limitado, terreno): fora da área, nada colide; a borda não puxa nem empurra.
- Terreno com dobras (não é gráfico): marcado como gráfico, o colisor usa a altura máxima; o usuário escolhe o modo
  geral.
- Superfície colidível animada rápida: o colisor é atualizado a cada passo da física em que muda.
- Curvatura em pontos singulares (polos, cúspides): valor não finito descartado (fica o vizinho), sem NaN no material.
- Malha adaptativa com orçamento de triângulos excedido: a precisão é limitada ao orçamento, sem leitura de volta;
  contagem exposta.
- Muitas superfícies colidíveis: cada uma tem o seu colisor; o custo cresce com a quantidade e a resolução.

## Requirements _(mandatory)_

### Functional Requirements

**Colisor derivado da superfície**

- **FR-001**: Uma superfície paramétrica DEVE poder ser marcada como colidível, com o modo **gráfico** (altura sobre um
  plano: terreno) ou **geral** (distância com sinal amostrada no volume que envolve a superfície).
- **FR-002**: O colisor DEVE ser produzido na GPU a partir da superfície avaliada e atualizado quando ela muda (função,
  parâmetros, tempo com `animated`, espaço da cena), sem leitura de volta.
- **FR-003**: Corpos rígidos DEVEM colidir com o colisor (contato com normal e profundidade, atrito e restituição como
  os outros colliders).
- **FR-004**: Os solvers de partículas (SPH, PBF, MPM, XPBD, FEM) e os emissores DEVEM colidir com o colisor pela
  fronteira genérica já usada (distância e normal), inclusive com a adesão da 030.
- **FR-005**: A transformação da entidade (posição, rotação, escala) DEVE valer para o colisor como vale para o desenho.
- **FR-006**: Sem superfícies colidíveis, as trajetórias DEVEM ser idênticas, bit a bit, às atuais.

**Geometria diferencial**

- **FR-007**: A avaliação da superfície DEVE produzir, por vértice, a métrica (E, F, G), a segunda forma (L, M, N), as
  curvaturas gaussiana e média e as principais (com direções), por derivadas analíticas quando a função as dá (segundas
  derivadas opcionais) ou numéricas.
- **FR-008**: A amostra de superfície do material DEVE incluir as curvaturas (e a métrica), para materiais por
  curvatura.
- **FR-009**: Valores não finitos (pontos singulares) DEVEM ser descartados sem propagar ao desenho.

**Malha adaptativa**

- **FR-010**: Uma superfície DEVE poder usar malha adaptativa, com densidade guiada pela curvatura/métrica e pela
  distância à câmera ativa, com um orçamento máximo de triângulos; a malha uniforme da 009 continua o padrão.
- **FR-011**: A malha adaptativa DEVE ser produzida na GPU e desenhada com a contagem produzida na GPU (sem leitura de
  volta), pelo forward e pela sombra.
- **FR-012**: A malha adaptativa NÃO DEVE ter rachaduras entre regiões de níveis diferentes.
- **FR-013**: A malha adaptativa DEVE ser refeita quando a câmera ou a superfície mudam o suficiente, não a cada quadro
  sem mudança.

**Geometria de CPU**

- **FR-014**: A geometria paramétrica de CPU DEVE ter normais corretas (derivadas por diferenças da própria função),
  com as fixtures afetadas regravadas e listadas.

**Qualidade**

- **FR-015**: A mesma cena DEVE produzir a mesma trajetória a 30, 60 e 144 Hz com superfícies colidíveis animadas.
- **FR-016**: Nenhuma parte DEVE exigir leitura de volta por quadro.
- **FR-017**: Smokes com medidas (colisão no terreno e na superfície geral, curvaturas, adaptatividade, normais da CPU),
  no fonte e no build minificado; `bench:check` sem regressão e baseline regravado; `npm run ci` verde.
- **FR-018**: Documentação de arquitetura, guias e ROADMAP/PENDENCIAS atualizados; vídeos para o usuário.

### Key Entities

- **Superfície colidível**: a `ParametricSurface` com um modo de colisão (gráfico ou geral), resolução do colisor e
  folga.
- **Colisor de superfície**: o campo de alturas (gráfico) ou de distâncias com sinal (geral) produzido na GPU, com a
  sua caixa envolvente, consultado pelos solvers pela fronteira genérica.
- **Geometria diferencial por vértice**: métrica, segunda forma, curvaturas gaussiana, média e principais.
- **Malha adaptativa**: a malha da superfície refinada por região, com a contagem de desenho na GPU.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Terreno: 50 corpos rígidos em 6 s — nenhum abaixo da superfície além da folga, ≥ 95 % em repouso.
- **SC-002**: Fluidos (SPH, PBF, MPM) no terreno: nenhuma partícula abaixo da superfície; o centróide termina no vale
  (abaixo da altura média do terreno na área).
- **SC-003**: Superfície geral (toro, esfera): nenhuma penetração de corpos além da folga; nenhuma partícula de fluido
  com distância negativa além de meio espaçamento.
- **SC-004**: Curvaturas: esfera (K = 1/r², H = 1/r) com erro ≤ 1 %; toro com erro ≤ 2 %; sem valores não finitos.
- **SC-005**: Malha adaptativa: ≥ 2× mais triângulos por área perto da câmera do que longe; total ≤ 50 % da malha
  uniforme de mesma precisão máxima; nenhuma fresta (0 pixels de fundo através de uma superfície fechada).
- **SC-006**: Normais da geometria de CPU a ≤ 1° da analítica na esfera.
- **SC-007**: Sem superfícies colidíveis, todas as fixtures existentes passam sem regravar (exceto as da geometria de
  CPU, listadas).
- **SC-008**: 30/60/144 Hz: mesmo estado com terreno colidível animado.
- **SC-009**: `bench:check` sem regressão; smokes no fonte e com `--dist`; `npm run ci` verde.
- **SC-010**: Vídeos (terreno colidível com corpos e fluido; superfície deformando com malha adaptativa; material por
  curvatura) enviados ao usuário.

## Assumptions

- O colisor geral é uma distância com sinal amostrada numa grade 3D envolvendo a superfície (resolução configurável); o
  sinal vem da orientação da normal (dentro = lado oposto ao da normal); superfícies abertas têm "dentro" apenas local.
- O colisor gráfico supõe a superfície como altura sobre o plano xz local da entidade.
- A malha adaptativa usa padrões de refinamento por célula da grade (sem rachaduras por construção) e desenho indireto;
  o orçamento padrão limita a memória.
- A geometria de CPU continua existindo (compatibilidade); a recomendada passa a ser a `ParametricSurface`.
- Colisões entre superfícies e corpos são unilaterais (a superfície não é empurrada pelos corpos).
- As curvaturas usam as segundas derivadas analíticas quando a função as dá; senão, diferenças centrais.
