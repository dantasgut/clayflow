# Feature Specification: Transformações reativas

**Feature Branch**: `feature/003-reactive-transforms`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Transformações reativas (spec 003, fase F0 do roadmap — pré-requisito da 002). Corrigir no
lugar arquitetural certo, sem helpers, o fato de o motor não posicionar objetos por posição/rotação/escala. Marcação
automática de sujo; Transform só intenção; estágio de transformação em compute produzindo a matriz de mundo; forward e
sombra lendo esse resultado; física publicando pose."

---

## Contexto e Problema

Hoje um objeto criado com `new Transform({ position: [5, 0, 0, 1] })` aparece **na origem**. O motor não converte
posição, rotação e escala em posicionamento: o `Transform` ganhou na implementação um campo de matriz que o desenho da
refundação não tinha, esse campo nasce como identidade e nada o calcula. Só objetos com corpo rígido aparecem no lugar
certo, porque a física escreve essa matriz depois de copiar o estado da GPU para a CPU — e, para avisar a mudança,
acessa por conversão de tipo um membro privado do mundo. Os exemplos do README e do guia de migração não funcionam como
escritos.

A arquitetura refundada previa o mecanismo certo e ele não foi implementado:

- o `Transform` é **só intenção** — posição, rotação e escala ([arquitetura, C3](../../clay-engine-doc/docs/guides/architecture_resource_loaders.md));
- **mutar o dado de um recurso emite o evento de sujo automaticamente**, e o sistema de recursos reage reenviando o
  dado — sem chamada manual (seção "Mutação pós-spawn");
- o trabalho é feito por **estágios** (Flows) que consomem e produzem dados na GPU, desacoplados por eventos.

Esta feature restaura esse mecanismo para as transformações. Ela é pré-requisito do harness de benchmark (spec 002),
que precisa posicionar objetos sem contornos, e é a base do estágio de transformação que, nas fases seguintes do
[roadmap](../ROADMAP.md), recebe hierarquia opcional (F2), funções do usuário (F3) e cadeias não euclidianas (F6).

**Princípio norteador:** corrigir no lugar arquitetural certo — recurso + evento + estágio —, sem funções auxiliares
que contornem o mecanismo; a matriz de mundo é **produto de um estágio**, não um campo de dado do usuário.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Posicionar objetos por posição, rotação e escala (Priority: P1)

Como desenvolvedor que usa o motor, quero que um objeto apareça exatamente onde sua posição, rotação e escala indicam,
para montar cenas sem calcular matrizes à mão.

**Why this priority**: É o defeito que impede qualquer cena estática correta e bloqueia o benchmark (spec 002) e os
exemplos da documentação. Sozinha, entrega um motor que posiciona objetos.

**Independent Test**: Criar objetos com posições, rotações e escalas diferentes, renderizar um quadro e verificar que
cada um aparece no lugar, orientação e tamanho esperados (inclusive na sombra).

**Acceptance Scenarios**:

1. **Given** uma cena com câmera, luz e um cubo com posição (5, 0, 0), **When** o quadro é renderizado, **Then** o cubo
   aparece centrado em x = 5, não na origem.
2. **Given** um cubo com rotação de 45° em torno de Y e escala (2, 1, 1), **When** o quadro é renderizado, **Then** o
   cubo aparece girado e esticado conforme esses valores, com iluminação coerente com a nova orientação.
3. **Given** um objeto que projeta sombra, **When** ele é posicionado fora da origem, **Then** a sombra corresponde à
   posição, rotação e escala dele.
4. **Given** os exemplos de código do README e do guia de migração, **When** executados, **Then** os objetos aparecem
   como o texto descreve.

---

### User Story 2 - Alterar o dado e ver a mudança sem chamadas manuais (Priority: P2)

Como desenvolvedor, quero mudar a posição, rotação ou escala de um objeto em tempo de execução simplesmente alterando
seu dado, e ver a mudança no quadro seguinte, sem precisar avisar o motor.

**Why this priority**: É o mecanismo reativo previsto pela arquitetura (mutação emite o evento de sujo). Vale para todo
recurso do motor, não só transformações, e elimina chamadas manuais e acessos indevidos a membros privados.

**Independent Test**: Com a cena rodando, alterar o dado de posição de um objeto (atribuindo o campo inteiro ou um
componente) e verificar que o quadro seguinte mostra o objeto no novo lugar, sem nenhuma outra chamada.

**Acceptance Scenarios**:

1. **Given** um objeto na cena, **When** o desenvolvedor atribui um novo valor ao campo de posição, **Then** o próximo
   quadro mostra o objeto na nova posição.
2. **Given** um objeto na cena, **When** o desenvolvedor altera um único componente da posição (ex.: só o x), **Then** o
   próximo quadro reflete a mudança.
3. **Given** várias alterações no mesmo recurso dentro de um mesmo quadro, **When** o quadro é renderizado, **Then** o
   resultado reflete o último valor e o dado é reenviado uma única vez naquele quadro.
4. **Given** qualquer outro recurso do motor com dado (ex.: cor de um material), **When** seu dado é alterado, **Then** a
   mudança aparece no quadro seguinte pelo mesmo mecanismo, sem chamada manual.

---

### User Story 3 - Física move objetos publicando apenas a pose (Priority: P3)

Como desenvolvedor, quero que corpos rígidos continuem caindo, colidindo e girando na tela, com o motor de física
publicando só a pose (posição e rotação) e o estágio de transformação produzindo o posicionamento final, para que a
física não precise conhecer matrizes nem membros internos do mundo.

**Why this priority**: Mantém a física funcionando sobre o novo mecanismo e remove o acoplamento atual (escrita da
matriz e acesso privado ao barramento de eventos). A remoção da cópia GPU→CPU fica para a F2.

**Independent Test**: Rodar a cena de corpos rígidos existente e verificar que os corpos se movem como antes e que a
escala definida pelo desenvolvedor é preservada (hoje a física a força para 1).

**Acceptance Scenarios**:

1. **Given** corpos rígidos sobre um chão, **When** a simulação roda, **Then** eles caem, colidem e giram na tela como
   antes desta feature.
2. **Given** um corpo rígido cujo objeto visual tem escala diferente de 1, **When** a simulação roda, **Then** a escala
   visual é preservada enquanto posição e rotação seguem a física.

---

### Edge Cases

- **Objeto sem transformação** → continua não sendo desenhado, como hoje (o desenho exige uma transformação
  colocalizada); nenhum erro.
- **Rotação não normalizada** (quaternion com módulo ≠ 1) → o resultado é o da rotação normalizada; nunca deforma o
  objeto.
- **Escala zero ou negativa** → aceita: escala zero colapsa o objeto (invisível), escala negativa espelha; a iluminação
  continua coerente (faces e normais orientadas corretamente).
- **Alteração do dado de um objeto controlado pela física** → a física prevalece no passo seguinte (a pose publicada por
  ela sobrescreve a posição/rotação); a escala do desenvolvedor é mantida. Teleporte de corpos físicos fica fora de
  escopo.
- **Inserção e remoção de muitos objetos no mesmo quadro** → todos aparecem/desaparecem corretamente no quadro seguinte;
  slots liberados são reaproveitados sem objetos "fantasma".
- **Alteração de um recurso já removido da cena** → ignorada sem erro e sem reenvio.
- **Código existente que fornece a matriz pronta** (campo de matriz no construtor ou atribuído) → o campo deixa de
  existir; o motor emite um aviso claro de que o posicionamento passa a ser por posição/rotação/escala (mudança
  incompatível documentada).

## Requirements _(mandatory)_

### Functional Requirements

**Mecanismo reativo (genérico para recursos)**

- **FR-001**: Toda alteração do dado de um recurso inserido na cena — atribuição de um campo ou alteração de um
  componente de um campo vetorial — DEVE emitir automaticamente o evento de sujo daquele recurso, sem chamada manual.
- **FR-002**: Alterações múltiplas no mesmo recurso dentro de um quadro DEVEM ser coalescidas: o dado é reenviado à GPU
  no máximo uma vez por quadro, antes da gravação dos passes daquele quadro, com o último valor.
- **FR-003**: Recursos cujo buffer é produzido pela GPU (estado gerido pela GPU) NÃO DEVEM ter esse buffer sobrescrito
  por reenvio da CPU.
- **FR-004**: Alterações em recursos não inseridos ou já removidos NÃO DEVEM gerar reenvio nem erro.
- **FR-005**: Nenhum componente do motor DEVE acessar membros privados do mundo ou do barramento de eventos para
  sinalizar mudanças; a sinalização passa exclusivamente pelo mecanismo reativo.

**Transformação como intenção**

- **FR-006**: O recurso de transformação DEVE conter apenas intenção — posição, rotação (quaternion) e escala —, como no
  desenho da refundação; o campo de matriz DEVE ser removido do seu dado.
- **FR-007**: Código que ainda fornecer o campo de matriz DEVE receber um aviso explícito (uma vez por execução) e a
  mudança DEVE constar como incompatível nas notas de versão e no guia de migração.

**Estágio de transformação**

- **FR-008**: O motor DEVE ter um estágio de transformação, executado na GPU a cada quadro antes dos estágios de sombra e
  de desenho, que produz a matriz de mundo de cada objeto a partir de posição, rotação e escala (ordem escala → rotação →
  translação).
- **FR-009**: O resultado do estágio DEVE ficar num buffer produzido pela GPU (não reenviado pela CPU), indexado pelo
  slot estável da entidade, junto com a matriz para normais coerente com escala não uniforme e negativa.
- **FR-010**: O estágio DEVE ser um estágio substituível do mecanismo de estágios (Flows), registrado por padrão, de modo
  que fases futuras possam trocá-lo ou estendê-lo (hierarquia opcional, função de transformação do usuário, cadeias não
  euclidianas) sem alterar os estágios que consomem seu resultado.
- **FR-011**: Quando nenhuma transformação mudou desde o quadro anterior, o estágio NÃO DEVE refazer trabalho
  desnecessário além do custo fixo mínimo.

**Consumo pelo desenho e pela sombra**

- **FR-012**: Os estágios de desenho e de sombra DEVEM obter o posicionamento de cada objeto do resultado do estágio de
  transformação, pelo slot da entidade, e NÃO DEVEM mais copiar dado de transformação da CPU por objeto a cada quadro.
- **FR-013**: A iluminação DEVE usar a matriz de normais produzida pelo estágio (corrige normais com escala não
  uniforme).

**Física**

- **FR-014**: A física de corpos rígidos DEVE publicar apenas a pose (posição e rotação) no recurso de transformação,
  pelo mecanismo reativo, preservando a escala definida pelo desenvolvedor.
- **FR-015**: A cópia do estado da física GPU→CPU continua existindo nesta feature (sua remoção é escopo da F2), mas sem
  acessos privados (FR-005).

**Documentação e qualidade**

- **FR-016**: README, guia de primeiros passos, guia de migração e guia de arquitetura DEVEM refletir o comportamento
  real: posicionamento por posição/rotação/escala, mutação reativa, estágio de transformação, e a decisão de onde a
  matriz de mundo é produzida (lacuna atual do documento de arquitetura).
- **FR-017**: Toda lógica determinística nova (detecção de mutação, coalescência, composição de transformação e matriz
  de normais, alocação/reuso de slots) DEVE ter testes automatizados no CPU; o desenho correto DEVE ser verificado por
  smoke de navegador, incluindo os exemplos do README.

### Key Entities

- **Transformação** — intenção de posicionamento de um objeto: posição, rotação, escala. Dado do desenvolvedor.
- **Matriz de mundo (e de normais)** — produto do estágio de transformação, por objeto, vivendo na GPU; consumida pelos
  estágios de sombra e desenho. Não é dado do desenvolvedor.
- **Estágio de transformação** — estágio padrão e substituível que transforma intenções em matrizes de mundo a cada
  quadro.
- **Evento de sujo** — sinal emitido automaticamente quando o dado de um recurso muda; o sistema de recursos reage
  reenviando o dado uma vez por quadro.
- **Pose da física** — posição e rotação publicadas pela simulação de corpos rígidos no recurso de transformação.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Em uma cena de verificação com objetos em posições, rotações e escalas variadas, 100% deles aparecem no
  lugar, orientação e tamanho esperados (tolerância de 1 pixel na projeção), e suas sombras coincidem.
- **SC-002**: 100% dos exemplos de código do README e dos guias que criam objetos produzem o resultado descrito no texto.
- **SC-003**: Uma alteração do dado de posição aparece na tela no quadro imediatamente seguinte, em 100% das tentativas,
  sem nenhuma chamada além da própria alteração.
- **SC-004**: Com 10 alterações do mesmo recurso num quadro, o dado é reenviado exatamente uma vez naquele quadro.
- **SC-005**: Numa cena estática de 10 mil objetos, o tempo de CPU por quadro gasto com transformações não cresce com o
  número de objetos quando nada muda (nenhum envio por objeto por quadro), e não piora em relação ao estado atual em
  nenhuma cena existente.
- **SC-006**: A cena de corpos rígidos existente se comporta visualmente como antes, e a escala visual definida pelo
  desenvolvedor é preservada em 100% dos corpos.
- **SC-007**: Nenhum componente do motor acessa membros privados do mundo ou do barramento de eventos (verificável por
  inspeção e pelo verificador de tipos sem conversões forçadas).
- **SC-008**: Gate completo verde (lint, formatação, ciclos, código morto, tipos, testes com cobertura, cobertura de
  documentação, build da biblioteca) e smokes de navegador sem regressão.

## Assumptions

- A remoção do campo de matriz é uma mudança incompatível aceitável no estágio atual do projeto (versão 0.x); o aviso e
  o guia de migração bastam.
- A cópia GPU→CPU da física permanece até a F2 (spec `007-gpu-scene-state`), quando a física passará a escrever a pose
  direto na GPU.
- Hierarquia de transformações (componente opcional de pai), câmera calculada na GPU, funções de transformação do
  usuário e deformações de espaço não lineares ficam para as fases F2, F3 e F6; esta feature só garante que o estágio
  seja substituível e que seu resultado seja consumido por slot, sem impedir essas extensões.
- A câmera continua com suas matrizes calculadas pelos controladores, como hoje (mudança prevista para a F2).
- A ordem de composição escala → rotação → translação segue a convenção da documentação de matemática do projeto
  (`M = T·R·S`).

## Out of Scope

- Hierarquia/`Parent` (F2, decisão D1 do roadmap), câmera em compute (F2), pontos de extensão programáveis (F3), espaços
  curvos (F6), remoção do readback da física e escrita direta da pose na GPU (F2), instancing e agrupamento de desenhos
  (F2), teleporte de corpos físicos.
