# Feature Specification: Estado de cena na GPU e paridade de desempenho com o Three.js

**Feature Branch**: `feature/007-gpu-scene-state`

**Created**: 2026-10-13

**Status**: Implementada (2026-10-13) — T001–T065 concluídas, gate verde; SC-005 p99 (≤ 1,5× a média) não atendido,
registrado no `tasks.md` (T063) para decisão do usuário

**Input**: User description: "Estado de cena na GPU e paridade de desempenho com o Three.js (spec 007, fase F2 do
roadmap — `007-gpu-scene-state`). Implementar no lugar arquitetural certo (C1–C4, `architecture_resource_loaders.md`
autoritativo), sem helpers nem atalhos, as correções do diagnóstico do PR #38 (clayflow × Three.js) e todo o item 007
do ROADMAP §5 (linha F2), puxando para cá o que de outras fases for necessário para as correções. Diagnóstico: (1)
`instances/10k` CPU 14,5 ms × 0,03 ms do Three — 10 001 draws contra 2 com `InstancedMesh`; (2) `instances/10k-moving`
CPU 199 ms × 1,3 ms — um envio por objeto alterado, sem agrupamento; (3) `rigid-bodies/10k` 9 × 36 fps — GPU 28 × 6,7
ms pela narrowphase O(N·M) sem broadphase (E2) e p99 de 309 ms pelo readback da pose para a CPU a cada quadro (E3); (4)
`instances/1m` derruba a aba; (5) GPU de `instances/10k` 0,66 ms contra o alvo 0,52 ms do SC-010 da 006. Escopo do
ROADMAP 007: pools de Transform/Camera/Light/Material/`Renderable` na GPU; dedup de geometria por conteúdo; `Parent`
opcional no `TransformFlow`; câmera = `Camera` + `Transform` com kernel de câmera, controllers mutando o `Transform`,
`Input` como Resource; vertex pulling e draws agrupados por (geometria, pipeline) com instâncias; forward e sombra
consomem pools; física escreve a pose direto no pool de `Transform` na GPU (fim do readback). Puxado de outras fases:
broadphase do LCP sobre a busca de vizinhança da 005 (E2, F5/015); envio por delta agrupado (F7); o que for preciso
para `instances/1m` rodar. Critérios: draws dependentes só de (geometria, pipeline); CPU por quadro na ordem do Three;
`rigid-bodies/10k` sem readback e na ordem do Three+Rapier; `instances/100k` e `1m` rodam; SC-010 da 006 resolvido ou
explicado; `bench:check` sem regressão e baseline regravado; imagens idênticas; mesma trajetória a 30/60/144 Hz; build
minificado; smokes com `--dist`; gate verde."

---

## Contexto e Problema

A 006 ligou o modelo de slots e tirou do forward toda alocação e todo bind por entidade. O benchmark com a máquina
livre (PR #38) mostra que a distância para o Three.js continua grande, e o diagnóstico aponta causas que o documento
de arquitetura já resolve no modelo alvo da F2 (§4.1 do ROADMAP: "o caminho quente nunca passa pela CPU"):

| Cena                   | clayflow                     | Three.js           | Causa no código                                                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instances/10k`        | 14,5 ms de CPU, 10 001 draws | 0,03 ms, 2 draws   | Um draw por entidade, com vertex e index buffer religados em cada um; a geometria não é deduplicada (10 mil caixas idênticas = 20 mil buffers), então nada poderia ser agrupado; o forward percorre todas as entidades na CPU a cada quadro                                     |
| `instances/10k-moving` | 199 ms de CPU                | 1,3 ms             | Um `writeBuffer` por Transform alterado; o slot de cada um é achado por varredura linear dos ocupantes do pool (O(N) por envio, O(N²) com todos sujos); cada envio emite um `resourceReady` repassado a todos os estágios                                                       |
| `rigid-bodies/10k`     | 9 fps, GPU 28 ms, p99 309 ms | 36 fps, GPU 6,7 ms | Narrowphase testa todo corpo contra todo collider (O(N·M)) em cada substep; a pose volta da GPU para a CPU a cada quadro (readback), é reatribuída ao `Transform` na CPU e reenviada — um quadro de atraso e picos quando a leitura espera a GPU; cada bola tem a sua geometria |
| `instances/1m`         | derruba a aba                | 352 fps            | ~2 milhões de buffers de geometria, gravação de 1 milhão de draws por quadro e estruturas de CPU por entidade em cada estágio                                                                                                                                                   |
| `instances/10k` (GPU)  | 0,66 ms                      | 0,09 ms            | O alvo de 0,52 ms do SC-010 da 006 não foi atingido; ~0,12 ms de causa não identificada (binds e shader descartados por experimento)                                                                                                                                            |

Além do desempenho, o estado de cena ainda passa pela CPU onde o documento diz que não deveria:

- **Câmera fora do modelo**: as matrizes são calculadas na CPU pelos controllers (três cópias da mesma matemática) e
  escritas em `Camera.data`; a câmera não tem `Transform`; o `aspect` não acompanha o canvas.
- **`Input` fora do World**: é estado JS da camada de apresentação, não um Resource consultável por estágios.
- **Sem hierarquia**: não existe `Parent`; o `TransformFlow` só compõe TRS por slot.
- **Luz pela CPU**: o pool `Light` existe e nenhum shader o lê; a direção da luz chega por um uniform escrito pela CPU
  e a matriz da sombra é calculada na CPU.

Esta spec entrega o estado de cena na GPU (F2/007) e traz para cá o que as correções exigem de outras fases: a
broadphase (F5/015) e o envio por delta agrupado (F7/020). O comportamento visível não muda: mesmas imagens e mesmas
trajetórias.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Muitas cópias do mesmo objeto custam como uma (Priority: P1)

Quem monta uma cena com milhares de objetos da mesma forma — cada um com o seu material e a sua posição — cria as
entidades como sempre (uma geometria, um material e um `Transform` por entidade; nenhuma instância compartilhada). O
motor reconhece geometrias de mesmo conteúdo, guarda uma só cópia na GPU e desenha todas as entidades que usam a mesma
geometria e o mesmo pipeline num único draw com instâncias. O custo de CPU por quadro de uma cena parada não depende do
número de entidades.

**Why this priority**: É a maior distância medida (CPU 480× pior em `instances/10k`) e a condição para `100k` e `1m`
rodarem.

**Independent Test**: Montar `instances/10k`, `100k` e `1m`; contar draws por passe, buffers de geometria e CPU por
quadro; comparar a imagem com a de referência.

**Acceptance Scenarios**:

1. **Given** 10 mil entidades com geometrias de mesmo conteúdo (mesmo schema e parâmetros) e materiais de mesmo schema
   com cores diferentes, **When** a cena é montada, **Then** existe uma cópia da geometria na GPU e o forward grava 1
   draw.
2. **Given** entidades com duas geometrias distintas e dois schemas de material, **When** um quadro é gravado, **Then**
   o forward grava um draw por par (geometria, pipeline) presente — no máximo 4 —, e cada instância lê a sua matriz de
   mundo e o seu material.
3. **Given** uma cena sem nenhuma mudança, **When** quadros consecutivos são gravados, **Then** o trabalho de CPU por
   quadro não percorre as entidades e não cresce com o número delas.
4. **Given** uma entidade inserida ou removida, **When** o quadro seguinte é gravado, **Then** ela aparece ou some no
   draw do seu grupo, sem afetar as demais.
5. **Given** o material de uma entidade trocado para outro schema (outro pipeline), **When** o quadro seguinte é
   gravado, **Then** ela passa para o grupo do novo pipeline.
6. **Given** a última entidade que usa uma geometria removida, **When** a liberação ocorre, **Then** a cópia da
   geometria na GPU é liberada; enquanto houver uma entidade usando, ela fica.
7. **Given** uma entidade com escala espelhada (determinante negativo), **When** desenhada, **Then** usa a variante de
   pipeline com a face frontal invertida, como hoje.
8. **Given** a sombra ativa, **When** o passe de sombra é gravado, **Then** também desenha um draw por grupo de
   geometria (e variante de face), não um por entidade.

---

### User Story 2 - Objetos em movimento enviam só o que mudou, em lote (Priority: P1)

Quem anima milhares de objetos muda `position`/`rotation` dos `Transform` a cada quadro. O motor junta as mudanças do
quadro e as envia à GPU em lotes contíguos; achar o lugar de cada dado no pool é imediato; nenhum evento por objeto é
repassado a estágios que não dependem dele.

**Why this priority**: É a segunda maior distância (`10k-moving` 150× pior) e o mesmo caminho atende a física, os
materiais e qualquer dado de cena mutado pela CPU.

**Independent Test**: Rodar `instances/10k-moving`; contar escritas na GPU por quadro e medir a CPU por quadro; mudar
um único objeto e verificar que só o seu dado é enviado.

**Acceptance Scenarios**:

1. **Given** 10 mil `Transform` alterados no mesmo quadro, com slots contíguos, **When** o quadro é gravado, **Then** o
   envio é feito em um número de escritas proporcional ao número de faixas contíguas sujas, não ao de objetos.
2. **Given** um único `Transform` alterado, **When** o quadro é gravado, **Then** só o dado dele é enviado.
3. **Given** um dado de pool sujo, **When** é enviado, **Then** a localização do seu slot é constante no número de
   ocupantes do pool.
4. **Given** milhares de dados enviados num quadro, **When** os estágios são notificados, **Then** cada estágio recebe
   no máximo uma notificação por pool alterado, não uma por objeto.
5. **Given** o mesmo objeto mutado várias vezes no quadro, **When** o quadro é gravado, **Then** o valor enviado é o
   último.

---

### User Story 3 - Física sem volta pela CPU e com broadphase (Priority: P1)

Quem simula milhares de corpos rígidos vê o movimento fluido: a física escreve a pose de cada corpo direto no estado
de cena da GPU, o render a lê no mesmo quadro e nenhuma leitura de GPU para CPU acontece por quadro. Cada corpo só é
testado contra colliders próximos. Quem precisa da pose na CPU (gameplay, testes) pede uma leitura sob demanda, que
chega de forma assíncrona.

**Why this priority**: `rigid-bodies/10k` é a cena com movimento visivelmente travado; o readback causa os picos e a
narrowphase quadrática domina a GPU.

**Independent Test**: Rodar `rigid-bodies/1k` e `10k`; contar leituras GPU→CPU por quadro (devem ser zero), pares
testados pela narrowphase e p99 do intervalo de quadro; comparar trajetórias com as fixtures a 30, 60 e 144 Hz.

**Acceptance Scenarios**:

1. **Given** corpos rígidos simulados, **When** quadros são gravados, **Then** nenhuma leitura de GPU para CPU ocorre
   por quadro, e a pose desenhada é a do passo de física do mesmo quadro (sem o quadro de atraso de hoje).
2. **Given** um corpo rígido com `Transform`, **When** a física avança, **Then** a pose é escrita pela GPU no slot do
   `Transform` do corpo, e a CPU não sobrescreve esse dado.
3. **Given** o código de aplicação que muta o `Transform` de um corpo dinâmico, **When** a mutação ocorre, **Then** ela
   é ignorada com um aviso único que nomeia o corpo (a GPU é dona da pose; regra do `upload: 'initial'`).
4. **Given** um pedido de leitura da pose de um corpo ou de um conjunto, **When** atendido, **Then** os valores chegam
   de forma assíncrona e correspondem ao último passo concluído; sem pedido, nada é lido.
5. **Given** N corpos espalhados, **When** a narrowphase roda, **Then** cada corpo é testado só contra os colliders das
   células vizinhas, e o número de pares testados cresce com os pares próximos, não com N·M.
6. **Given** os contatos gerados pela broadphase, **When** o solver os consome, **Then** o conjunto de contatos de
   cada substep é igual ao da narrowphase exaustiva de hoje, e a trajetória é a mesma bit a bit (o solve não depende
   da ordem dos contatos).
7. **Given** colliders grandes (chão) ou planos infinitos, **When** a broadphase roda, **Then** continuam testados
   contra todos os corpos que alcançam, sem perder contato.

---

### User Story 4 - Câmera calculada na GPU a partir de Camera + Transform (Priority: P2)

Quem cria uma câmera insere uma entidade com `Camera` (parâmetros de projeção) e `Transform` (posição e orientação).
Um estágio de câmera produz view, projection e viewProjection na GPU; o `aspect` acompanha o canvas. Os controllers
(orbit, fly, fps) são componentes da entidade da câmera, leem o `Input` e mutam só o `Transform`. O `Input` é um
Resource do World, consultável por estágios.

**Why this priority**: Fecha o estado de cena da F2 (a câmera é o último dado de cena calculado na CPU) e remove três
cópias da matemática de câmera; não é causa do custo medido.

**Independent Test**: Inserir uma câmera com `Transform` e redimensionar o canvas; verificar as matrizes produzidas
contra a referência, que o `aspect` mudou no mesmo quadro e que um controller move a câmera mutando só o `Transform`.

**Acceptance Scenarios**:

1. **Given** uma entidade com `Camera` e `Transform`, **When** um quadro é gravado, **Then** view, projection e
   viewProjection são produzidas na GPU e consumidas pelo forward, sem cálculo de matriz na CPU.
2. **Given** o canvas redimensionado, **When** o quadro seguinte é gravado, **Then** o `aspect` das câmeras que seguem o
   canvas foi atualizado.
3. **Given** um controller orbit na entidade da câmera, **When** o usuário arrasta o ponteiro, **Then** o controller
   muta só o `Transform` da câmera, e a imagem gira como hoje.
4. **Given** o `Input` no World, **When** um estágio declara que o consome, **Then** recebe o Resource como singleton.
5. **Given** perspectiva e ortográfica, **When** escolhidas em `Camera`, **Then** a projeção produzida corresponde à
   matemática de referência.
6. **Given** uma câmera sem `Transform`, **When** inserida, **Then** um erro claro nomeia a entidade e o componente
   ausente.

---

### User Story 5 - Hierarquia opcional de Transform (Priority: P2)

Quem precisa que um objeto siga outro adiciona um `Parent` apontando para a entidade pai. O estágio de transformação
compõe a matriz de mundo do filho a partir da do pai, por níveis, na GPU. Sem `Parent`, nada muda.

**Why this priority**: Está na linha F2 do ROADMAP e é pré-requisito de cenas articuladas (F8); não afeta o benchmark.

**Independent Test**: Montar uma cadeia pai → filho → neto, mover o pai e verificar as matrizes de mundo dos
descendentes; remover o pai e verificar o comportamento documentado.

**Acceptance Scenarios**:

1. **Given** um filho com `Parent` apontando para um pai, **When** o pai se move, **Then** a matriz de mundo do filho é
   a do pai composta com a local dele, no mesmo quadro.
2. **Given** uma cadeia de profundidade D, **When** composta, **Then** cada nível usa o nível anterior já composto
   neste quadro.
3. **Given** um `Parent` que formaria ciclo, **When** inserido, **Then** é rejeitado com erro que nomeia as entidades.
4. **Given** o pai removido, **When** a remoção ocorre, **Then** o filho passa a ser raiz (matriz de mundo = local) e
   um aviso nomeia a entidade.
5. **Given** uma cena sem nenhum `Parent`, **When** composta, **Then** o custo e o resultado são os de hoje.

---

### User Story 6 - Luz e sombra lidas do estado de cena (Priority: P2)

O forward lê a luz direcional do pool `Light`; a matriz da luz da sombra é produzida na GPU a partir da luz e dos
parâmetros do `ShadowMap`. Nada de luz é escrito pela CPU por quadro.

**Why this priority**: Completa "forward e sombra consomem pools"; não é causa do custo medido.

**Independent Test**: Cena com luz direcional que projeta sombra; mudar a direção da luz e verificar a imagem contra a
referência e que nenhuma escrita de luz por quadro foi feita pela CPU além do dado da luz alterado.

**Acceptance Scenarios**:

1. **Given** uma `DirectionalLight`, **When** o forward ilumina, **Then** lê direção, cor e intensidade do pool `Light`.
2. **Given** uma luz que projeta sombra, **When** o quadro é gravado, **Then** a matriz da luz é produzida na GPU e a
   imagem é a mesma de hoje.
3. **Given** nenhuma luz que projeta sombra, **When** o forward roda, **Then** a sombra fica desligada como hoje.

---

### User Story 7 - Escala de um milhão de entidades (Priority: P2)

Quem monta uma cena de um milhão de entidades simples consegue montá-la e renderizá-la: nenhuma estrutura cresce com
custo de objeto de GPU por entidade e a memória por entidade fica limitada aos dados do estado de cena.

**Why this priority**: Critério explícito do pedido e prova de que o custo não é mais por entidade.

**Independent Test**: Rodar `instances/1m` no protocolo do benchmark até o fim; medir memória de GPU e tempo de
montagem.

**Acceptance Scenarios**:

1. **Given** `instances/1m`, **When** o benchmark roda, **Then** completa as três repetições sem travar a aba.
2. **Given** um milhão de entidades com a mesma geometria, **When** montadas, **Then** a memória de GPU é a dos pools
   de estado de cena mais uma cópia da geometria, sem objeto de GPU por entidade.
3. **Given** a inserção de um milhão de entidades num só quadro, **When** processada, **Then** o custo é linear no
   número de entidades e os pools crescem por dobra sem reempacotar na CPU os dados já enviados.

---

### User Story 8 - Causa do residual de GPU explicada (Priority: P3)

O alvo de GPU do SC-010 da 006 (`instances/10k` ≤ 0,52 ms) é perseguido com o render agrupado. Se o agrupamento o
atinge, fica registrado; se não, a causa do residual é isolada por experimento e registrada com números.

**Why this priority**: Pendência herdada; o agrupamento por instâncias muda o perfil de GPU e deve ser medido antes de
qualquer investigação nova.

**Independent Test**: Medir a GPU de `instances/10k` com o render agrupado contra o A/B do `b437e47`.

**Acceptance Scenarios**:

1. **Given** o render agrupado, **When** `instances/10k` é medida, **Then** a GPU por quadro é ≤ 0,52 ms, ou o
   relatório registra a causa do residual com o experimento que a isola.

---

### Edge Cases

- Geometrias de mesmo schema e parâmetros mas criadas em momentos diferentes: compartilham a cópia; a primeira
  inserção cria, a última remoção libera.
- Geometria cujo conteúdo é mutado depois de inserida (dados de vértice alterados): deixa de compartilhar e ganha
  cópia própria, ou o conjunto que a compartilha é atualizado — a regra fica definida no plano e é testada; nunca uma
  entidade altera a forma de outra sem querer.
- Grupo de draw que fica vazio: não grava draw com zero instâncias.
- Grupo que cresce além da capacidade da lista de instâncias: a lista cresce por dobra e os bind groups são trocados
  por evento (`bindGroupReplaced`), como os pools.
- Entidade com material de schema sem pipeline compilado ainda: fica fora dos draws até o pipeline estar pronto, sem
  aviso repetido.
- Mudança de escala que inverte o determinante em tempo de execução: a entidade troca de variante de face no quadro em
  que a matriz de mundo muda; como a matriz é produzida na GPU, a variante é decidida a partir do dado de intenção
  (`Transform.scale`) que a CPU já tem, ou na GPU — a regra fica no plano, sem leitura de volta.
- Corpo rígido removido no meio do passo: o slot do `Transform` deixa de receber pose a partir do quadro seguinte; nada
  é escrito em slot reaproveitado por outra entidade.
- Corpo rígido estático (massa 0): a GPU publica a pose inicial, que não muda; o `Transform` de todo corpo é de posse
  da GPU (mover corpo pela CPU é da F5).
- Leitura de pose pedida para um corpo removido antes de a leitura chegar: a resposta indica que o corpo não existe
  mais, sem erro.
- Corpos fora da grade da broadphase: continuam testados (célula de borda ou lista de grandes), sem perder contato.
- Mais pares próximos que a capacidade da lista de candidatos: a capacidade cresce ou o excedente é sinalizado com
  aviso; nunca há perda silenciosa de contato.
- Câmera com `aspect` fixo definido pela aplicação: não é sobrescrito pelo canvas.
- Duas câmeras na cena: cada uma tem a sua matriz no pool; o forward usa a câmera ativa, como hoje.
- `Parent` apontando para entidade sem `Transform`: rejeitado com erro claro.
- `Parent` em corpo rígido dinâmico: rejeitado com erro claro (a pose é de mundo, escrita pela física).
- Canvas redimensionado e pool crescendo no mesmo quadro: os dois eventos são tratados e nenhum objeto destruído é
  referenciado.
- Build minificado: chaves de dedup, nomes de grupos, pools e schemas são dados explícitos, nunca nomes de classe.

## Requirements _(mandatory)_

### Functional Requirements

**Geometria e desenho agrupado**

- **FR-001**: A Camada 2 MUST deduplicar geometria por conteúdo — schema e parâmetros de construção, ou os dados de
  vértice e índice quando não há parâmetros —, mantendo uma cópia na GPU por conteúdo distinto, com contagem de uso;
  a cópia MUST ser liberada quando o último usuário sai. A instância JS continua não compartilhável (`ReuseError`).
- **FR-002**: O forward MUST gravar um draw por par (geometria, pipeline/variante) presente na cena, com o número de
  instâncias do grupo; cada instância MUST localizar o seu registro `Renderable` por uma lista de instâncias do grupo
  mantida na GPU.
- **FR-003**: A composição dos grupos (quem pertence a qual par) MUST ser mantida por eventos (inserção, remoção,
  troca de material, troca de variante de face), não recalculada percorrendo entidades a cada quadro; com a cena
  parada, a gravação MUST NOT percorrer entidades.
- **FR-004**: A sombra MUST desenhar agrupada da mesma forma, por (geometria, variante de face).
- **FR-005**: O vértice MUST ser lido pelo índice de instância e de vértice a partir dos buffers da geometria
  compartilhada (atributos de vértice da cópia única; vertex pulling e arena única avaliados e passados à F7 — research R4).
- **FR-006**: Grupo vazio MUST NOT gerar draw; lista de instâncias que cresce MUST seguir a política de pool
  (dobra, `poolReallocated`/`bindGroupReplaced`).

**Envio por delta**

- **FR-007**: A localização do slot de um Resource no seu pool MUST ser constante no número de ocupantes, no envio e
  na liberação.
- **FR-008**: Os dados sujos de um pool MUST ser enviados por faixas contíguas de slots, uma escrita por faixa, com o
  último valor do quadro.
- **FR-009**: A notificação de envio aos estágios MUST ser agregada por pool e quadro (no máximo uma por pool alterado
  e estágio interessado), não por Resource.
- **FR-010**: O crescimento de um pool MUST copiar na GPU os dados já enviados, sem reempacotar todos os ocupantes na
  CPU.

**Física na GPU**

- **FR-011**: A física de corpos rígidos MUST escrever a pose (posição e rotação) de cada corpo dinâmico direto no slot
  do `Transform` do corpo no pool da GPU, antes da fase de transformação do mesmo quadro.
- **FR-012**: O `Transform` de um corpo dinâmico MUST ser de posse da GPU: a CPU MUST NOT enviá-lo depois da inserção;
  mutação pela aplicação MUST ser ignorada com aviso único por corpo.
- **FR-013**: Nenhuma leitura de pose da GPU para a CPU MUST ocorrer por quadro na física; a leitura da pose MUST
  existir como pedido assíncrono sob demanda (um corpo, um conjunto ou todos), respondido com o último passo
  concluído. O diagnóstico de excedente de contatos e de pares MAY ser amostrado (no máximo 1 leitura de poucos bytes
  a cada 60 passos, sem bloquear).
- **FR-014**: A narrowphase de corpos rígidos MUST receber pares candidatos de uma broadphase em GPU construída sobre a
  busca de vizinhança e os kernels genéricos da 005 (grade uniforme, ordenação, prefix sum); colliders maiores que a
  célula e planos MUST continuar cobertos.
- **FR-015**: O conjunto de contatos de cada substep MUST ser igual ao da narrowphase exaustiva de hoje (o solve é
  independente da ordem — spec 004, R19), para que a trajetória seja a mesma bit a bit.
- **FR-016**: Excesso de candidatos além da capacidade MUST crescer a capacidade ou avisar; perda silenciosa de
  contato MUST NOT ocorrer.

**Câmera, Input e hierarquia**

- **FR-017**: `Camera` MUST conter os parâmetros de projeção (tipo, fov ou altura ortográfica, near, far, aspect,
  modo de aspect) e MUST ser combinada com o `Transform` da mesma entidade; um estágio de câmera MUST produzir view,
  projection e viewProjection na GPU num pool de câmeras, consumido pelo forward. A CPU MUST NOT calcular matrizes de
  câmera.
- **FR-018**: O `aspect` das câmeras que seguem o canvas MUST ser atualizado na reconfiguração do canvas.
- **FR-019**: Os controllers orbit, fly e fps MUST ser componentes da entidade da câmera que leem o `Input` e mutam só
  o `Transform` (e o alvo, quando houver); a matemática de câmera MUST existir uma vez (no estágio de câmera).
- **FR-020**: `Input` MUST ser um Resource singleton do World, inserido pela aplicação, com a API de consulta atual, e
  resolvível em `consumes`.
- **FR-021**: `Parent` MUST ser um componente opcional; o estágio de transformação MUST compor a matriz de mundo por
  níveis na GPU; ciclos e pai sem `Transform` MUST ser rejeitados; pai removido MUST tornar o filho raiz com aviso;
  `Parent` em corpo dinâmico MUST ser rejeitado.

**Luz e sombra**

- **FR-022**: O forward MUST ler a luz direcional do pool `Light`; nenhum uniform de luz MUST ser escrito pela CPU por
  quadro.
- **FR-023**: A matriz da luz do `ShadowMap` MUST ser produzida na GPU a partir da luz e dos parâmetros do `ShadowMap`.

**Escala**

- **FR-024**: Nenhuma estrutura de CPU por entidade MUST existir nos estágios de render além das listas mantidas por
  evento; a inserção em massa MUST ser linear e a montagem de um milhão de entidades MUST caber nos limites do
  dispositivo informados pelo relatório de capacidades.

**Preservação e verificação**

- **FR-025**: A imagem das cenas de render (smoke `render` e cenas do benchmark) MUST ser a mesma de antes. Se o
  cálculo das matrizes de câmera em GPU mudar o último bit de algum pixel, a tolerância MUST ser declarada e
  justificada no plano antes da implementação.
- **FR-026**: A trajetória das sete cenas de física MUST ser a mesma a 30, 60 e 144 Hz (bit a bit, ou dentro da
  tolerância registrada na 005).
- **FR-027**: O benchmark MUST deixar de declarar as limitações resolvidas (sem instancing, readback, envio por objeto,
  narrowphase O(N·M)) e o adaptador do clayflow MUST criar a câmera pelo modelo novo (sem matrizes na CPU).
- **FR-028**: O documento de arquitetura, o guia de migração, o ROADMAP e o PENDENCIAS MUST descrever o estado novo;
  nenhuma marca "alvo da F2/007" atendida MUST restar.
- **FR-029**: Nenhum struct MUST ser duplicado entre TypeScript e WGSL; o build minificado MUST funcionar; fronteira
  D4 mantida.

### Key Entities

- **Cópia de geometria**: dado de vértice e índice na GPU, único por conteúdo, com contagem de usuários; identificado
  pela chave de conteúdo (schema + parâmetros ou hash dos dados).
- **Grupo de draw**: par (geometria, pipeline/variante) com a lista de instâncias (slots de `Renderable`) mantida por
  eventos; um draw por grupo não vazio.
- **Pool de Transform**: intenção (posição, rotação, escala) por slot; escrito pela CPU (envio por delta) ou pela física
  (corpos dinâmicos).
- **Pool de câmeras**: parâmetros de projeção por câmera e as matrizes produzidas pelo estágio de câmera.
- **Pool de luzes**: dados das luzes, lidos pelo forward e pela produção da matriz da sombra.
- **`Parent`**: referência opcional de uma entidade à entidade pai; nível derivado.
- **`Input`**: Resource singleton com o estado de teclado, ponteiro, toque e gamepad do quadro.
- **Pares candidatos**: saída da broadphase por substep, em ordem determinística, consumida pela narrowphase.
- **Pedido de leitura de pose**: requisição assíncrona sob demanda, com a resposta do último passo concluído.

## Success Criteria _(mandatory)_

Medidos com `npm run bench` na máquina de referência livre, no mesmo protocolo e na mesma rodada do Three.js.

### Measurable Outcomes

- **SC-001**: `instances/10k`, `100k` e `1m`: 1 draw no forward (uma geometria, um pipeline); de modo geral, draws =
  número de grupos (geometria, pipeline) presentes, contado em teste com 10 mil entidades e 4 grupos.
- **SC-002**: CPU por quadro de `instances/10k` ≤ 1 ms (hoje 14,5 ms; Three 0,03 ms), e a de `100k` e `1m` no máximo
  1,5× a de `10k` (custo por quadro constante no número de entidades com a cena parada).
- **SC-003**: `instances/1m` completa o protocolo (3 repetições) sem travar; `instances/100k` a pelo menos 60 fps de
  intervalo de quadro.
- **SC-004**: CPU por quadro de `instances/10k-moving` ≤ 3 ms (hoje 199 ms; Three 1,3 ms), com o número de escritas de
  Transform por quadro igual ao número de faixas contíguas sujas (contado em teste).
- **SC-005**: `rigid-bodies/10k`: 0 leituras de pose da GPU para a CPU por quadro (contadas em teste; diagnóstico amostrado pela FR-013); fps de intervalo de
  quadro ≥ o do Three + Rapier na mesma rodada (hoje 9 × 36); p99 do intervalo de quadro ≤ 1,5× a média.
- **SC-006**: Pares testados pela narrowphase em `rigid-bodies/10k` ≤ 1% de N·M (contados em teste com a mesma
  disposição), sem contato perdido contra a narrowphase exaustiva.
- **SC-007**: GPU por quadro de `instances/10k` ≤ 0,52 ms, ou causa do residual registrada com o experimento que a
  isola (US8).
- **SC-008**: 0 cálculos de matriz de câmera na CPU (verificação no gate: nenhum controller nem adaptador produz
  view/projection); `aspect` atualizado no quadro seguinte ao redimensionamento.
- **SC-009**: Imagens das cenas de render idênticas às de referência (ou na tolerância declarada pela FR-025);
  trajetórias idênticas a 30, 60 e 144 Hz.
- **SC-010**: `bench:check` sem regressão > 10% contra o baseline vigente (Chrome 155, `b17d5d6`), tratada a
  bimodalidade conhecida da GPU de `10k-moving` (PENDENCIAS §0); baseline regravado ao fim.
- **SC-011**: Gate completo verde (format, lint, tsc, `test:coverage`, `build:lib`, `doc:coverage` sem membro sem
  documentação); todos os smokes passam no código-fonte e com `--dist`.

## Assumptions

- "Na ordem do Three" foi traduzido em limites absolutos medidos na mesma máquina (SC-002, SC-004, SC-005). O Three
  mede só o `render()` da cena e o `update` dela; o clayflow mede `update` + `app.step` inteiro (tempo, eventos,
  estágios), por isso o limite de `instances/10k` é 1 ms e não 0,03 ms.
- A cena `instances` do benchmark cria uma geometria por entidade (idênticas) e um material por entidade (mesmo schema,
  cores distintas); a dedup por conteúdo (FR-001) é o que permite agrupar sem mudar a cena. A cena `rigid-bodies` cria
  uma `SphereGeometry` por bola, também deduplicada.
- O Three usa `InstancedMesh` e Rapier na CPU; a comparação é pelo custo efetivo por quadro, como o resumo do
  benchmark já faz.
- O agrupamento desta spec é por instâncias com draw direto; a geração de draws indiretos por culling em compute
  continua na F7 (020).
- A broadphase entra aqui só para os corpos rígidos (LCP); XPBD paralelo e demais lacunas da F5 continuam lá.
- Envio por delta aqui é o agrupamento por faixas contíguas e a localização O(1) de slots; bundles estáticos e LOD
  continuam na F7.
- Câmeras offscreen (`targetTag`), multi-câmera e render-to-texture continuam na F4 (014); esta spec mantém uma câmera
  ativa, agora calculada na GPU.
- Luzes pontuais e iluminação clustered continuam na F4 (013); o forward lê só a luz direcional do pool, como hoje.
- Pontos de extensão `transform`/`camera` com funções WGSL do usuário continuam na F3 (009); aqui os estágios são
  substituíveis e trazem os prontos (TRS, TRS + `Parent`, perspectiva, ortográfica).
- A leitura sob demanda da pose substitui o uso que testes e smokes fazem hoje de `transform.data` em corpos.
- Sem camada de compatibilidade para a API removida (matrizes em `Camera.data`, controllers mutando a câmera); o guia
  de migração registra o equivalente.

## Out of Scope

- Geometria produzida em compute, corpos como contêineres de partículas e render de partículas (008).
- Pontos de extensão matemáticos com funções do usuário (F3).
- HDR, PBR, luzes pontuais, texturas, multi-câmera e render-to-texture (F4).
- XPBD paralelo, FEM elástico, campos de força, colisores SDF, consultas espaciais e demais lacunas P1–P10, E1 e E4
  (F5).
- Culling em compute com draws indiretos, LOD e bundles estáticos (F7).
