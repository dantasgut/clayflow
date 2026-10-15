# Feature Specification: Pontos de extensão matemáticos

**Feature Branch**: `feature/009-math-extension-points`

**Created**: 2026-10-14

**Status**: Implementada (2026-10-14) — T001–T038 concluídas, `npm run ci` verde, 20 smokes (fonte e `--dist`), fixtures existentes bit a bit, baseline regravado; campos (F5/016) e emissor na GPU (F9/025) antecipados

**Input**: User description: "Pontos de extensão matemáticos (spec 009, fase F3 do roadmap —
`009-math-extension-points`). Conforme ROADMAP §4.3 e §4.4 (nível N2): cada estágio compute aceita uma função WGSL do
usuário com assinatura fixa, composta pelo núcleo de shaders (WgslModule, dedup por símbolo, um símbolo definido uma
única vez) e validada na criação (erro claro nomeando o ponto e a assinatura esperada), complementando os slots de
dados do Flow<TSlots,S>. Pontos: `transform` (slot, data, t) → mat4 (prontos: TRS, TRS + Parent); `camera` (data, t) →
{ view, projection } (perspectiva/ortográfica, lookAt); `surface` (u, v, t, data) → vec3 com derivadas opcionais
(plano, esfera, toro, terreno por ruído) — só o ponto e a avaliação; malha adaptativa, métrica/curvatura e colisor são
da 010; `space` (x, t) → x' com Jacobiana numérica ou fornecida (identidade) — só o ponto; aplicação consistente a
geometria/luz/sombra é da F6/019; `field` (x, v, t) → força (gravidade, vento, vórtice, arrasto, empuxo, consumidos
pelos solvers que já existem); `material` (amostra de superfície) → parâmetros PBR (PBR por constantes; mapas na
F4/012); `emit` (i, t, data) → partícula (ponto, esfera, cone). Implementações prontas do motor passam a ser funções
nesses pontos (o caminho padrão reproduz exatamente as trajetórias e imagens atuais: fixtures sem regravar). Parâmetros
do usuário por Resource (data) com layout gerado; troca da função em execução por evento (Resource + evento + Flow, sem
helpers), recompila o pipeline sem realocar dados; motor agnóstico (C3/C4 não importam a C1;
`architecture_resource_loaders.md` autoritativo). Critérios: cada ponto com exemplo do usuário funcionando em smoke
(ex.: órbita por equação, projeção não linear, superfície por homotopia, campo arbitrário, padrão procedural, emissor
arbitrário); função inválida rejeitada com mensagem útil sem derrubar o motor; mesma trajetória a 30/60/144 Hz; sem
leitura de volta por quadro; sem regressão no bench:check e baseline regravado; smokes inclusive --dist; `npm run ci`
verde; vídeos dos exemplos para o usuário. Também: corrigir no ROADMAP o status da 030 (integrada pelo PR #42) e o
bugfix de ciclos (PR #43). Fora de escopo: malha adaptativa e colisor SDF (010), espaços curvos aplicados à cena e
portais (019), texturas por mapa (012). Branch: feature/009-math-extension-points a partir de develop (git flow)."

## Contexto e Problema

O ROADMAP (§4.3) define sete "slots de função" que complementam os slots de dados dos Flows: o usuário escreve a
matemática de um estágio e o motor cuida do resto. Hoje nenhum existe, e quatro estágios nem existem na GPU
(levantamento na `develop` após o PR #43):

| Ponto       | Estado atual (evidência)                                                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transform` | TRS isolado em `transform_local` (`transform_local.wgsl`), ligado fixo nos kernels `transform_compose`/`transform_link`; os parâmetros do passe não têm tempo                                              |
| `camera`    | Funções isoladas em `math/camera.wgsl`, mas o seletor de projeção e a composição estão no kernel `camera_compose`; sem tempo                                                                               |
| `surface`   | `ParametricGeometry` amostra uma função JavaScript na CPU, com normais fixas `[0,1,0]`; não há superfície avaliada na GPU, nem toro ou terreno                                                             |
| `space`     | Nada                                                                                                                                                                                                       |
| `field`     | Só a gravidade é consumida, lida na CPU e copiada para o uniforme de cada solver; a conta está inline em seis kernels; `WindField`, `VortexField`, `DragField` e `BuoyancyField` não são lidos por ninguém |
| `material`  | O forward faz Lambert + ambiente + sombra + cáusticas; `roughness`/`metallic` do material não são usados                                                                                                   |
| `emit`      | `ComputeParticleEmitter` só declara um pool; não há kernel nem Flow de emissão; as formas (ponto, esfera, cone) amostram na CPU                                                                            |

A composição de WGSL também não tem como trocar uma função: um símbolo definido em dois módulos é erro, e a única troca
possível é registrar outro Flow inteiro.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Escrever a matemática de um estágio (Priority: P1)

Quem monta uma cena escreve uma função curta na linguagem de shader do motor, com a assinatura do ponto (por exemplo
`transform(slot, data, t) → matriz`), declara os parâmetros que ela recebe e anexa a função aos objetos ou à cena. O
motor compõe a função no estágio, cria o layout dos parâmetros, valida a função e passa a usá-la, sem que o usuário
escreva um Flow, um pipeline ou um bind group. Objetos sem função própria continuam com a implementação pronta.

**Why this priority**: é o nível N2 do ROADMAP — o motivo da fase F3 e a base de 010 (superfícies), 019 (espaços
curvos) e 025 (partículas).

**Independent Test**: uma cena com objetos em órbita por equação (função `transform` do usuário), outros parados com o
TRS padrão, e uma câmera com projeção não linear (função `camera` do usuário); medir as posições e a imagem.

**Acceptance Scenarios**:

1. **Given** 100 objetos com uma função `transform` do usuário que os põe numa órbita circular de raio r e período T
   (com fase pelo slot), **When** a cena corre 2 s, **Then** a posição de cada objeto lida da GPU coincide com a
   equação (erro ≤ 1e-4 r), e os objetos sem a função ficam exatamente onde o TRS os põe.
2. **Given** uma câmera com uma função `camera` do usuário (projeção olho de peixe ou equiretangular), **When** o
   quadro é desenhado, **Then** a imagem mostra a deformação esperada (linhas retas da cena curvas, conferidas em
   pixels de referência), e a sombra e o restante do quadro continuam corretos.
3. **Given** a mesma cena sem nenhuma função do usuário, **When** corre, **Then** trajetórias e imagens são
   idênticas, bit a bit, às atuais (fixtures sem regravar).
4. **Given** uma função com parâmetros declarados (raio, velocidade), **When** o usuário muda um parâmetro em
   execução, **Then** o efeito aparece no quadro seguinte, sem recompilar nem realocar nada.

---

### User Story 2 - Campos de força e emissores programáveis (Priority: P1)

Quem simula declara campos (os prontos — gravidade, vento, vórtice, arrasto, empuxo — ou um campo próprio `field(x, v,
t) → aceleração`) e todos os solvers de partículas e corpos passam a senti-los. Quem quer partículas declara um emissor
(ponto, esfera, cone ou uma função `emit(i, t, data) → partícula`) e elas nascem, se movem sob os campos e morrem na
GPU.

**Why this priority**: os campos prontos já existem como Resources e não fazem nada (lacuna visível ao usuário); o
emissor é o único jeito de testar o ponto `emit`.

**Independent Test**: partículas de SPH, um tecido XPBD e corpos rígidos sob vento e vórtice; um campo do usuário
(ex.: atração para um anel); três emissores prontos e um do usuário (ex.: espiral) — medir trajetórias.

**Acceptance Scenarios**:

1. **Given** corpos de cada solver (rígido, XPBD, FEM, MPM, SPH, PBF) e um `WindField`, **When** a cena corre,
   **Then** todos derivam na direção do vento com aceleração consistente com o campo (mesmo campo, mesmo efeito em
   partículas soltas de todos os solvers).
2. **Given** um `VortexField`, um `DragField` e um `BuoyancyField`, **When** a cena corre, **Then** partículas giram
   em torno do eixo do vórtice, perdem velocidade com o arrasto e corpos menos densos que o meio do empuxo sobem.
3. **Given** um campo do usuário `field(x, v, t)` que atrai para um anel, **When** a cena corre, **Then** as
   partículas convergem para o anel, em todos os solvers.
4. **Given** só a gravidade (cena de hoje), **When** corre, **Then** as trajetórias são idênticas às fixtures.
5. **Given** um emissor em cone com taxa de 1 000 partículas/s e vida de 2 s, **When** corre 5 s, **Then** a
   contagem viva se estabiliza em 2 000 ± 1 %, as partículas saem dentro do cone e caem sob os campos.
6. **Given** um emissor com uma função `emit` do usuário (espiral), **When** emite, **Then** as posições iniciais
   seguem a função para o índice e o tempo de cada partícula.

---

### User Story 3 - Superfícies, espaço e material programáveis (Priority: P2)

Quem quer geometria matemática declara uma superfície (plano, esfera, toro, terreno por ruído ou `surface(u, v, t,
data) → ponto`, com derivadas opcionais) e o motor a avalia na GPU numa grade, com normais corretas, a cada quadro se
ela depende do tempo. Uma função `space(x, t) → x'` deforma essa geometria, com normais corrigidas pela Jacobiana. Uma
função `material(amostra) → parâmetros de superfície` pinta o objeto por regra (padrões procedurais).

**Why this priority**: são a base da 010 e da 019, mas cada uma só tem um consumidor nesta fase.

**Independent Test**: um toro, uma homotopia esfera ↔ toro animada, um terreno por ruído, uma torção `space` sobre a
superfície e um material xadrez dependente de (u, v) — imagem e normais.

**Acceptance Scenarios**:

1. **Given** uma esfera paramétrica de raio 1 em 64 × 32, **When** é avaliada, **Then** todo vértice está a 1 ± 1e-5
   do centro e a normal coincide com a radial (ângulo ≤ 0,5°), com derivadas analíticas e com derivadas numéricas.
2. **Given** uma homotopia esfera → toro dependente de t, **When** a cena corre, **Then** a malha se transforma
   continuamente, sem leitura de volta, com normais coerentes em cada quadro.
3. **Given** uma função `space` de torção em torno de y aplicada à superfície, **When** é desenhada, **Then** os
   vértices são os da superfície torcidos, e as normais são as transformadas pela Jacobiana (iluminação sem costuras;
   com a Jacobiana fornecida e com a numérica, diferença ≤ 1°).
4. **Given** um material com função `material` do usuário (xadrez por (u, v) ou por posição de mundo), **When** o
   objeto é desenhado, **Then** a cor de cada célula é a da função; objetos com o material padrão ficam idênticos às
   fixtures.

---

### User Story 4 - Trocar a função em execução e ser avisado do erro (Priority: P2)

Quem experimenta troca a função de um ponto com a cena rodando (editor ao vivo) e vê o efeito no quadro seguinte. Uma
função com erro (assinatura errada, símbolo inexistente, erro de compilação) é rejeitada com uma mensagem que nomeia o
ponto, a assinatura esperada e a linha do erro; a cena continua com a função anterior.

**Why this priority**: sem isso a experimentação derruba o motor; é o critério "função inválida rejeitada" do pedido.

**Independent Test**: trocar em execução a função `transform` de órbita para espiral, e depois para uma função com
erro.

**Acceptance Scenarios**:

1. **Given** uma cena com a função de órbita, **When** o usuário troca para uma espiral, **Then** o quadro seguinte
   já usa a espiral, sem realocar os dados das entidades.
2. **Given** uma função com o nome ou os tipos da assinatura errados, **When** é criada, **Then** a criação falha na
   hora, com erro que diz o ponto, a assinatura esperada e a recebida.
3. **Given** uma função com a assinatura certa mas que não compila, **When** é aplicada, **Then** o motor anuncia a
   rejeição (evento com ponto, mensagem e linha), mantém a função anterior e continua desenhando.
4. **Given** uma função que redefine um símbolo do núcleo, **When** é criada, **Then** o erro nomeia o símbolo em
   conflito.

---

### Edge Cases

- Muitas funções distintas no mesmo ponto (ex.: 50 objetos, 10 funções `transform`): um pipeline por função, objetos
  agrupados por função; o custo cresce com o número de funções, não de objetos.
- Função que devolve NaN/infinito: o estágio não propaga para os vizinhos (matriz/partícula inválida descartada ou
  mantida no valor anterior), sem derrubar o quadro; aviso único por função.
- Laço sem fim numa função do usuário: o motor não protege contra travar a GPU (como qualquer shader); documentado.
- Função dependente do tempo com a cena pausada: o tempo usado é o tempo da simulação (`Time`), não o relógio; pausa
  congela a função.
- Função `space` não invertível ou com Jacobiana singular: normais degeneradas são substituídas pela normal original,
  sem NaN.
- Campo com força enorme: os solvers limitam como já limitam a gravidade alta (passo estável), sem explodir.
- Emissor com taxa maior do que a capacidade: as excedentes são descartadas, com contagem exposta; sem leitura de
  volta por quadro.
- Superfície com parâmetros que mudam a resolução da grade: realoca só a geometria daquele objeto.
- Mesmo símbolo auxiliar em duas funções do usuário (ex.: `hash`): cada função é composta no seu pipeline; dois
  símbolos iguais no mesmo pipeline são erro com nome do símbolo.

## Requirements _(mandatory)_

### Functional Requirements

**Infraestrutura comum**

- **FR-001**: O motor DEVE oferecer, para cada um dos sete pontos (`transform`, `camera`, `surface`, `space`, `field`,
  `material`, `emit`), uma assinatura fixa documentada (nome da função, parâmetros e retorno).
- **FR-002**: Uma função de ponto DEVE ser declarada como um Resource com o código da função, o ponto e o schema dos
  seus parâmetros; o layout dos parâmetros na GPU DEVE ser gerado do schema (sem struct escrito à mão duas vezes).
- **FR-003**: A função DEVE ser validada na criação: ponto conhecido, função com o nome e a assinatura do ponto,
  símbolos sem conflito com o núcleo; o erro DEVE nomear o ponto, a assinatura esperada e o que foi recebido.
- **FR-004**: A composição DEVE permitir que a função do usuário ocupe o lugar da implementação pronta de um ponto no
  estágio, mantendo a regra de que um símbolo é definido uma única vez em cada pipeline.
- **FR-005**: As implementações prontas DEVEM ser funções desses mesmos pontos (mesma assinatura que o usuário usa).
- **FR-006**: Sem nenhuma função do usuário, trajetórias e imagens DEVEM ser idênticas, bit a bit, às atuais.
- **FR-007**: Trocar a função de um ponto em execução DEVE ter efeito no quadro seguinte, recompilando só os pipelines
  afetados, sem realocar dados de entidades.
- **FR-008**: Erro de compilação da função DEVE ser anunciado por evento (ponto, mensagem, linha), mantendo a função
  anterior ativa; o motor continua desenhando.
- **FR-009**: Mudar parâmetros de uma função em execução DEVE ter efeito no quadro seguinte sem recompilar.
- **FR-010**: Toda função recebe o tempo da simulação; a mesma cena DEVE produzir a mesma trajetória a 30, 60 e 144 Hz.
- **FR-011**: Nenhum ponto DEVE exigir leitura de volta da GPU por quadro.

**Pontos de cena**

- **FR-012**: `transform(slot, data, t) → matriz de mundo local` DEVE substituir o TRS por entidade; entidades sem
  função usam o TRS; a hierarquia (`Parent`) DEVE compor sobre o resultado da função, como hoje sobre o TRS; a matriz
  normal DEVE ser derivada da matriz devolvida.
- **FR-013**: Entidades com funções `transform` diferentes DEVEM ser agrupadas por função, um despacho por grupo.
- **FR-014**: `camera(data, t) → { view, projection }` DEVE substituir a composição da câmera; prontas: perspectiva,
  ortográfica e lookAt. Projeções não lineares (que não cabem numa matriz) DEVEM poder ser expressas por uma função de
  projeção de ponto aplicada no desenho, sem quebrar sombra nem profundidade.

**Pontos de física**

- **FR-015**: `field(x, v, t) → aceleração` DEVE ser somado por todos os solvers (rígido, XPBD, FEM, MPM, SPH, PBF) em
  cada partícula/corpo, no lugar da gravidade inline; a soma dos campos ativos é composta numa única função por cena.
- **FR-016**: Os campos prontos (gravidade, vento, vórtice, arrasto, empuxo) DEVEM ser funções `field`, com os dados
  dos Resources que já existem; fonte pontual (`sourceMode`) DEVE ser respeitada.
- **FR-017**: `emit(i, t, data) → partícula` (posição, velocidade, vida, cor) DEVE alimentar um emissor que nasce,
  integra (sob os campos) e recicla partículas na GPU, desenhadas como as partículas de hoje; prontos: ponto, esfera,
  cone, com taxa, vida e capacidade.

**Pontos de geometria e aparência**

- **FR-018**: `surface(u, v, t, data) → ponto` (com derivadas opcionais) DEVE ser avaliada na GPU numa grade u × v,
  produzindo posições, normais (do produto vetorial das derivadas, analíticas ou por diferenças) e (u, v), desenhada
  pelo forward e pela sombra; prontas: plano, esfera, toro e terreno por ruído.
- **FR-019**: `space(x, t) → x'` (Jacobiana opcional; senão numérica) DEVE poder deformar a geometria produzida pelas
  superfícies, com normais transformadas pela Jacobiana; pronta: identidade (sem custo).
- **FR-020**: `material(amostra) → parâmetros de superfície` (cor base, rugosidade, metalicidade, emissão) DEVE
  substituir a leitura das constantes do material; a amostra traz posição, normal, (u, v) e tempo; pronta: constantes
  do material. O modelo de iluminação continua o de hoje (Cook-Torrance é da 011).

**Qualidade**

- **FR-021**: O custo de um ponto com a implementação pronta DEVE ficar dentro da tolerância do `bench:check`.
- **FR-022**: Cada ponto DEVE ter um exemplo do usuário em smoke, com medida e fixture.
- **FR-023**: A documentação de arquitetura DEVE descrever os pontos (assinaturas, composição, troca e erros), e o
  guia de shaders DEVE deixar de listá-los como "fora desta versão"; o ROADMAP DEVE registrar a 030 (PR #42) e o
  bugfix de ciclos (PR #43) como integrados.

### Key Entities

- **Função de ponto**: Resource com o ponto, o código WGSL, o schema dos parâmetros e os valores; anexado a uma
  entidade (transform, material, surface, emit), à câmera (camera) ou à cena (field, space).
- **Ponto de extensão**: definição do motor — nome, assinatura, tipos de entrada e saída, implementação pronta e o
  estágio que o consome.
- **Campo**: os `ForceField` existentes (gravidade, vento, vórtice, arrasto, empuxo) e campos do usuário, somados.
- **Superfície paramétrica (GPU)**: grade u × v avaliada por uma função `surface`, com geometria produzida em compute.
- **Emissor**: pool de partículas com taxa, vida, capacidade e função `emit`.
- **Rejeição de função**: evento com ponto, mensagem e linha.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Sem funções do usuário, todas as fixtures existentes (trajetórias, render, partículas, superfícies de
  fluido, comportamento de fluido, contatos) passam sem regravar.
- **SC-002**: Órbita por equação: posição de cada objeto dentro de 1e-4 × raio da equação, em 2 s, a 30/60/144 Hz.
- **SC-003**: Projeção não linear: pixels de referência da imagem dentro da tolerância da fixture nova.
- **SC-004**: Vento, vórtice, arrasto e empuxo: o mesmo campo produz a mesma aceleração (dentro de 1 %) em partículas
  livres de todos os solvers; campo do usuário atrai ≥ 90 % das partículas a menos de 0,1 do anel em 5 s.
- **SC-005**: Emissor: contagem viva estável em taxa × vida ± 1 %; 100 % das partículas nascem dentro da forma.
- **SC-006**: Superfícies: esfera com erro de raio ≤ 1e-5 e normal ≤ 0,5°; Jacobiana numérica × fornecida ≤ 1°.
- **SC-007**: Troca de função em execução visível no quadro seguinte; função com erro rejeitada e a cena continua
  desenhando (nenhum quadro perdido).
- **SC-008**: `bench:check` sem regressão; com 10 funções `transform` distintas em 10 k objetos, a CPU por quadro
  fica dentro de 10 % da cena sem funções.
- **SC-009**: Smokes no fonte e com `--dist`; `npm run ci` verde.
- **SC-010**: Vídeos dos exemplos (órbita, projeção, campos, emissores, homotopia, torção, material) enviados ao
  usuário.

## Assumptions

- A função do usuário é confiável como qualquer shader: o motor valida assinatura e compilação, não termina laços.
- Os pontos por entidade (`transform`, `material`, `surface`, `emit`) usam a função anexada à entidade; os de cena
  (`field`, `space`) são compostos para a cena inteira; `camera` é por câmera.
- Os campos de força passam a ser consumidos nesta spec (antecipado da F5/016 do ROADMAP, porque o ponto `field` não
  tem sentido sem consumidores); colisores e FEM com solve elástico continuam na F5.
- O emissor desta spec nasce, integra e recicla; ordenação, soft particles e flipbooks continuam na F9/025.
- `space` aplica-se só à geometria produzida pelas superfícies desta spec; aplicação à cena inteira, luz e sombra é da
  F6/019.
- O material programável muda os parâmetros de entrada da iluminação, não o modelo (Lambert hoje; Cook-Torrance na
  011).
- Projeção não linear: a câmera do usuário pode devolver matrizes ou uma projeção de ponto; o forward usa a projeção
  de ponto no vertex shader quando houver.
- A composição de símbolos passa a permitir que um módulo de ponto seja substituído pelo do usuário; o resto da regra
  "um símbolo, uma definição" continua.
