# Feature Specification: Endurecimento do núcleo

**Feature Branch**: `feature/004-core-hardening`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Endurecimento do núcleo (spec 004, fase F1 do roadmap — `004-core-hardening`). Corrigir no
lugar arquitetural certo (refundação C1–C4), sem helpers nem atalhos, as lacunas do núcleo: dispositivo completo e
relatório de capacidades; cache do hash de identidade das specs com imutabilidade executável; `Time` governando a
simulação (`step()`, passo fixo com acumulador, `scale`/`physicsScale`, headless); ResourceSystem alocando a bag
inteira; `GpuManaged` efetivo; reuso de instância proibido; índices `uint32`; fim de `constructor.name`; vazamentos
corrigidos. Medido contra o baseline da F0."

---

## Contexto e Problema

A refundação ([arquitetura C1–C4](../../clay-engine-doc/docs/guides/architecture_resource_loaders.md)) define contratos
que o núcleo ainda não cumpre. A auditoria do [roadmap](../ROADMAP.md) (§3) e a linha de base medida pela F0 (spec 002)
apontam lacunas que não são de desempenho de renderização (essas vão para a 006 e a F2), e sim de **correção do
núcleo**:

- **Identidade de recursos recalculada a cada uso.** A refundação diz que a spec de um recurso é a sua identidade e é
  imutável; o motor deriva dela uma chave por conteúdo. Hoje essa chave é recalculada do zero a cada uso — em todo
  bind de todo draw —, serializando a spec inteira, inclusive o código do shader. No perfil da F0, isso é ~90% da CPU
  por quadro do clayflow. Ao mesmo tempo, nada impede que uma spec seja alterada depois de criada, o que tornaria
  qualquer cache incorreto: a imutabilidade é só uma convenção.
- **A simulação não obedece ao tempo.** Cada estágio de física avança um passo fixo de 1/60 s **por quadro**, qualquer
  que seja a duração real do quadro: a 144 Hz a simulação corre 2,4× mais rápido, a 30 Hz anda em câmera lenta. O
  recurso `Time` tem `scale` e um passo fixo declarados, mas ninguém os lê; não há como pausar só a física, nem avançar
  a simulação sem o laço do navegador (testes, pré-cálculo, benchmark).
- **O dispositivo gráfico é pedido sem configuração.** Só a feature de timestamps foi adicionada (F0); limites,
  preferência de potência e as demais features não são pedidos nem informados — a aplicação não sabe com que
  capacidades está rodando.
- **O sistema de recursos aloca só parte do que os recursos declaram.** Buffers de vértice, índice e indiretos,
  texturas e samplers declarados pelos recursos são ignorados; um recurso com vários descritores do mesmo tipo
  materializa um só. As transições de estado do ciclo de vida são atribuídas diretamente, sem passar pela validação
  das transições permitidas.
- **Reuso de instância é aceito em silêncio.** A refundação proíbe inserir a mesma instância duas vezes ("sem clone
  implícito; sem entidades-fantasma"); hoje a reinserção é ignorada e um recurso compartilhado entre raízes é
  remapeado para a última, corrompendo a associação recurso → entidade.
- **Malhas limitadas a 65 535 vértices.** As geometrias geram sempre índices de 16 bits.
- **Comportamento dependente de nomes de classe.** Partes do motor identificam tipos pelo nome da classe, que um
  build minificado altera.
- **Vazamentos.** Ao remover entidades, os objetos de GPU criados para desenhá-las não são liberados; o estágio de
  depuração registra ouvintes que nunca remove.

**Princípio norteador:** cada correção no lugar que a refundação define — identidade e imutabilidade na C1, alocação e
ciclo de vida na C2, tempo como recurso consumido pelos estágios —, sem funções auxiliares que contornem o mecanismo.
O benchmark da F0 é o critério de aceite de desempenho.

**Fora de escopo:** migração dos Flows para slots tipados e consumo, pelo desenho e pela sombra, dos buffers alocados
pela C2 (spec 006); módulos de shader (spec 005); instancing, deduplicação de geometria e pools de câmera/material na
GPU (F2); solvers paralelos (F5); pausa/snapshot/restore da aplicação (F10).

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Identidade de recursos estável e barata (Priority: P1)

Como desenvolvedor que usa o motor, quero que o custo de usar um recurso já criado (ligar um pipeline, um grupo de
recursos, um buffer) não dependa do tamanho da sua descrição, e que o motor impeça alterar uma descrição depois de
criada, para que cenas com muitos objetos não paguem por recalcular identidades e para que a identidade nunca fique
inconsistente.

**Why this priority**: É o maior custo de CPU medido na linha de base da F0 e afeta toda cena. Sozinha, entrega a
primeira queda mensurável no benchmark.

**Independent Test**: Rodar o benchmark nas cenas medidas e comparar com o baseline da F0; em teste automatizado,
verificar que a identidade de uma descrição é calculada uma vez, que descrições com o mesmo conteúdo continuam
compartilhando o mesmo objeto de GPU e que alterar uma descrição já criada falha imediatamente.

**Acceptance Scenarios**:

1. **Given** uma cena com 10 mil objetos, **When** ela roda, **Then** o tempo de CPU por quadro do clayflow cai em
   relação ao baseline da F0 (SC-001), sem regressão nas demais cenas.
2. **Given** duas descrições distintas com o mesmo conteúdo, **When** ambas são criadas, **Then** resultam no mesmo
   objeto de GPU (a deduplicação por conteúdo continua valendo).
3. **Given** uma descrição já criada, **When** algum código tenta alterá-la, **Then** a alteração falha na hora com
   erro claro, em vez de deixar a identidade desatualizada.
4. **Given** uma descrição que contém outras (ex.: um pipeline que contém um shader), **When** a identidade é
   calculada, **Then** o código do shader é processado uma única vez, não a cada descrição que o inclui.

---

### User Story 2 - O tempo governa a simulação (Priority: P1)

Como desenvolvedor, quero que a simulação física avance pelo tempo — e não por quadro —, com passo fixo determinístico,
controle de velocidade (câmera lenta, pausa da física) e a possibilidade de avançar a simulação sem o laço do
navegador, para que o resultado seja o mesmo em qualquer taxa de quadros e possa ser reproduzido em testes.

**Why this priority**: Hoje a física corre em velocidades diferentes conforme o monitor — um defeito de correção
visível em qualquer cena com física, e pré-requisito de qualquer comparação reproduzível.

**Independent Test**: Simular a mesma cena por 5 segundos de tempo simulado a 30, 60 e 144 quadros por segundo e
comparar as trajetórias; avançar a simulação sem laço de quadros e comparar com a execução normal.

**Acceptance Scenarios**:

1. **Given** uma cena com corpos rígidos e passo fixo, **When** 5 s de simulação são executados a 30, 60 e 144 Hz,
   **Then** as posições finais dos corpos coincidem (SC-003).
2. **Given** a velocidade do tempo em 0,25, **When** a cena roda, **Then** a simulação avança a um quarto da
   velocidade real; **Given** velocidade 0, **Then** a física para e o desenho continua.
3. **Given** a física pausada isoladamente, **When** a cena roda, **Then** os corpos param e o resto (câmera,
   animações não físicas, desenho) continua.
4. **Given** uma aplicação sem laço de quadros, **When** o desenvolvedor pede N avanços de tempo, **Then** a simulação
   avança exatamente esses passos e o estado resultante é igual ao de uma execução com laço pelo mesmo tempo simulado.
5. **Given** um quadro muito longo (aba em segundo plano, travamento), **When** o laço retoma, **Then** a simulação não
   tenta compensar além de um limite (sem espiral de passos); o tempo excedente é descartado e o fato é observável.

---

### User Story 3 - Capacidades do dispositivo conhecidas (Priority: P2)

Como desenvolvedor, quero escolher a preferência de potência do dispositivo gráfico, que o motor peça as features e os
limites de que precisa (e os que estiverem disponíveis), e consultar um relatório do que foi obtido, para adaptar a
aplicação ao hardware e diagnosticar diferenças entre máquinas.

**Why this priority**: Sem os limites corretos, cenas grandes falham por limites padrão baixos; sem o relatório, falhas
dependentes de máquina não são diagnosticáveis. Não bloqueia as demais histórias.

**Independent Test**: Criar a aplicação com cada preferência de potência e ler o relatório; verificar que features e
limites relevantes disponíveis no adaptador foram obtidos.

**Acceptance Scenarios**:

1. **Given** a aplicação criada com preferência por alto desempenho, **When** o relatório é consultado, **Then** ele
   informa adaptador, features obtidas e limites efetivos.
2. **Given** um adaptador que oferece limites maiores que o padrão, **When** o dispositivo é criado, **Then** o motor
   obtém os limites de que suas cenas precisam (até o máximo do adaptador), e não os mínimos padrão.
3. **Given** uma feature opcional indisponível, **When** o dispositivo é criado, **Then** a criação segue sem ela e o
   relatório registra a ausência; uma feature obrigatória indisponível falha com mensagem clara.

---

### User Story 4 - Recursos alocados e com ciclo de vida íntegro (Priority: P2)

Como autor de recursos e estágios, quero que tudo o que um recurso declara seja alocado pelo sistema de recursos, que
cada recurso siga apenas as transições de estado permitidas, que a mesma instância não possa ser inserida duas vezes e
que malhas com mais de 65 535 vértices funcionem, para que os estágios possam confiar no que a C2 entrega.

**Why this priority**: É o contrato sobre o qual a 006 (estágios consumindo o que a C2 aloca) será construída; sem ele,
a 006 repetiria alocações ad hoc.

**Independent Test**: Em testes automatizados, declarar recursos com cada tipo de descritor (vértice, índice,
indireto, textura, sampler, uniform, storage — inclusive vários do mesmo tipo) e verificar a alocação; forçar
transições inválidas; inserir a mesma instância duas vezes; renderizar uma malha com mais de 65 535 vértices.

**Acceptance Scenarios**:

1. **Given** um recurso que declara buffers de vértice e índice, um buffer indireto, uma textura e um sampler,
   **When** é inserido, **Then** todos são alocados pela C2 e localizáveis por quem os consome.
2. **Given** um recurso com dois descritores do mesmo papel, **When** é inserido, **Then** os dois são alocados
   separadamente.
3. **Given** uma transição de estado não permitida pelo ciclo de vida, **When** ocorre, **Then** é rejeitada com erro
   claro; recursos cujo dado é produzido pela GPU nunca têm esse dado sobrescrito por envio da CPU.
4. **Given** uma instância já inserida, **When** é inserida de novo (ou compartilhada por duas raízes), **Then** a
   operação falha com erro que explica a regra e sugere criar outra instância.
5. **Given** uma superfície com 300 × 300 vértices, **When** renderizada, **Then** aparece inteira e correta.

---

### User Story 5 - Motor robusto em build minificado e sem vazamentos (Priority: P3)

Como desenvolvedor que publica a aplicação, quero que o motor funcione igual em build minificado e que criar e remover
objetos repetidamente não acumule memória, para que a aplicação em produção se comporte como em desenvolvimento.

**Why this priority**: Defeitos que só aparecem em produção ou em sessões longas; não afetam o desenvolvimento
imediato.

**Independent Test**: Rodar os smokes de navegador sobre o build minificado; criar e remover mil objetos cem vezes e
verificar que a memória de GPU e o número de ouvintes voltam ao patamar inicial.

**Acceptance Scenarios**:

1. **Given** o build minificado da biblioteca, **When** os smokes e uma cena do benchmark rodam, **Then** o resultado
   é igual ao do build não minificado.
2. **Given** ciclos repetidos de inserir e remover objetos, **When** terminam, **Then** a memória de GPU informada pelo
   motor volta ao valor inicial (SC-006).
3. **Given** a aplicação descartada, **When** o descarte termina, **Then** nenhum ouvinte de evento do motor ou do
   navegador registrado por ela permanece.

---

### Edge Cases

- **Descrição criada que contém outra já criada** → a identidade composta reutiliza a identidade já calculada da
  interna; nenhuma das duas pode ser alterada depois.
- **Código existente que altera uma descrição após criá-la** → passa a falhar; todo uso interno do motor é corrigido
  nesta feature e a mudança consta como incompatível nas notas de versão.
- **Descrição descartada** → a identidade memorizada é liberada junto com ela (sem crescimento de memória).
- **Passo fixo não definido** → a física integra com o `dt` efetivo do quadro, limitado ao máximo de compensação.
- **`dt` zero (pausa)** → nenhum passo de física; o desenho continua; ao retomar, não há salto acumulado.
- **Mudança da velocidade do tempo durante a execução** → vale a partir do quadro seguinte, sem salto.
- **Adaptador sem uma feature opcional** (ex.: timestamps) → o motor segue sem ela; o relatório informa.
- **Limite pedido acima do máximo do adaptador** → o motor usa o máximo disponível e registra o valor efetivo.
- **Malha com até 65 535 vértices** → pode continuar com índices de 16 bits (economia); acima disso, 32 bits
  automaticamente, sem ação do desenvolvedor.
- **Remoção de entidade cujo recurso ainda está em uso por outro estágio** → a liberação acontece só depois que nenhum
  quadro em voo a usa.
- **Reinserção após remoção** → uma instância removida pode ser inserida de novo (a proibição é de duas inserções
  simultâneas).

## Requirements _(mandatory)_

### Functional Requirements

**Identidade e imutabilidade das descrições (C1)**

- **FR-001**: A identidade de uma descrição de recurso DEVE ser calculada no máximo uma vez por objeto de descrição; os
  usos seguintes DEVEM obtê-la sem reprocessar o conteúdo.
- **FR-002**: A memorização da identidade NÃO DEVE impedir a liberação da descrição quando ela deixa de ser
  referenciada.
- **FR-003**: Descrições com o mesmo conteúdo DEVEM continuar resultando no mesmo objeto de GPU (deduplicação por
  conteúdo preservada).
- **FR-004**: Criar uma descrição DEVE torná-la imutável em profundidade; qualquer tentativa posterior de alterá-la
  DEVE falhar imediatamente com erro que identifique a regra.
- **FR-005**: A identidade de uma descrição que contém outras DEVE ser composta a partir das identidades das internas,
  de modo que conteúdo grande compartilhado (ex.: código de shader) seja processado uma única vez.
- **FR-006**: Todo código do motor que hoje altera descrições após criá-las DEVE ser corrigido para criar descrições
  novas.

**Tempo governando a simulação**

- **FR-007**: O recurso de tempo DEVE ser a fonte única de tempo da aplicação: tempo real do quadro, tempo efetivo
  (escalado), tempo decorrido, número do quadro, velocidade global, velocidade da física e passo fixo opcional.
- **FR-008**: Os estágios de simulação DEVEM avançar pelo tempo efetivo da física (tempo do quadro × velocidade global ×
  velocidade da física), e não por um passo fixo por quadro.
- **FR-009**: Com passo fixo definido, a simulação DEVE acumular o tempo efetivo e executar tantos passos fixos quantos
  couberem, guardando o resto para o quadro seguinte.
- **FR-010**: O número de passos por quadro DEVE ser limitado; o tempo que exceder o limite DEVE ser descartado e o
  descarte DEVE ser observável (evento ou contador).
- **FR-011**: DEVE ser possível pausar e retomar a aplicação inteira (velocidade global) e só a física (velocidade da
  física), sem salto de tempo ao retomar.
- **FR-012**: A aplicação DEVE oferecer o avanço explícito do tempo (um ou N quadros com `dt` dado) sem laço de quadros
  do navegador, produzindo o mesmo estado que a execução com laço pelo mesmo tempo simulado.
- **FR-013**: Os estágios DEVEM obter o tempo do recurso de tempo no mundo, como qualquer outro recurso, sem referência
  direta à aplicação.

**Dispositivo**

- **FR-014**: A aplicação DEVE aceitar a preferência de potência do dispositivo (baixo consumo, alto desempenho) e a
  lista de features exigidas e desejadas.
- **FR-015**: O motor DEVE pedir as features que usa quando disponíveis e os limites de que precisa até o máximo do
  adaptador.
- **FR-016**: O motor DEVE expor um relatório de capacidades: adaptador (fabricante, arquitetura, descrição, se é de
  software), features obtidas e ausentes, e limites efetivos.
- **FR-017**: A falta de uma feature exigida DEVE falhar na criação com mensagem clara; a falta de uma desejada DEVE
  apenas constar no relatório.

**Sistema de recursos (C2)**

- **FR-018**: O sistema de recursos DEVE alocar todos os papéis declarados pelos recursos — uniform, storage, vértice,
  índice, indireto, textura e sampler — e todos os descritores de um recurso, inclusive vários do mesmo papel.
- **FR-019**: O que a C2 aloca DEVE ser localizável por recurso e descritor, para consumo pelos estágios (a migração
  dos estágios existentes para esse consumo é escopo da 006).
- **FR-020**: Toda mudança de estado do ciclo de vida DEVE passar pela validação de transições permitidas; transição
  inválida DEVE falhar com erro claro.
- **FR-021**: Um recurso cujo dado é produzido pela GPU DEVE ter o envio pela CPU suprimido pela regra do seu estado,
  consultada pelo sistema de recursos, e não por comparações espalhadas.
- **FR-022**: Inserir uma instância já inserida, ou um recurso já pertencente a outra raiz, DEVE falhar com erro que
  explique a regra; uma instância removida PODE ser inserida de novo.
- **FR-023**: As geometrias DEVEM usar índices de 32 bits quando o número de vértices exceder 65 535, e PODEM usar 16
  bits abaixo disso; o formato DEVE ser declarado pela geometria e respeitado por quem desenha.

**Robustez**

- **FR-024**: Nenhuma decisão do motor DEVE depender do nome de classe em tempo de execução; tipos DEVEM ser
  identificados pelo esquema declarado ou por marcação explícita.
- **FR-025**: Remover uma entidade DEVE liberar todos os objetos de GPU criados para ela pelos estágios, depois que
  nenhum quadro em voo os use.
- **FR-026**: Todo ouvinte (de eventos do motor ou do navegador) registrado por um componente DEVE ser removido no seu
  descarte.

**Documentação e qualidade**

- **FR-027**: Guias e documentação de API DEVEM refletir: imutabilidade das descrições, o recurso de tempo e o avanço
  explícito, o relatório de capacidades, a proibição de reuso e o formato de índices; as mudanças incompatíveis DEVEM
  constar nas notas de versão.
- **FR-028**: Toda lógica determinística nova (identidade e imutabilidade, acumulador de tempo, transições de estado,
  alocação por papel, escolha de formato de índice, liberação na remoção) DEVE ter testes automatizados no CPU; o
  comportamento no navegador DEVE ser verificado por smoke, inclusive sobre o build minificado.

### Key Entities

- **Descrição de recurso** — declaração imutável de um recurso de GPU; sua identidade por conteúdo é calculada uma vez.
- **Tempo** — recurso único da aplicação: tempo real, efetivo e decorrido, número do quadro, velocidades global e da
  física, passo fixo e acumulador.
- **Relatório de capacidades** — adaptador, features obtidas/ausentes e limites efetivos do dispositivo.
- **Alocação da C2** — conjunto dos objetos de GPU materializados para cada descritor de cada recurso.
- **Estado do recurso** — etapa do ciclo de vida, com transições permitidas e regras (ex.: dado produzido pela GPU).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: O tempo de CPU por quadro do clayflow cai **pelo menos 50%** em relação ao baseline da F0 em
  `instances/10k`, `instances/10k-moving` e `unique-objects/1k`, na máquina de referência.
- **SC-002**: A verificação de desempenho contra o baseline da F0 passa sem regressão (nenhuma métrica do clayflow
  piora mais que 10%; nenhuma cena que funcionava passa a falhar).
- **SC-003**: Com passo fixo, 5 s de simulação de corpos rígidos a 30, 60 e 144 quadros por segundo terminam com as
  mesmas posições, com diferença máxima de 1e-5 m entre quaisquer duas execuções.
- **SC-004**: Com velocidade 0,25, a simulação avança 25% (±1%) do tempo real decorrido; com a física pausada, nenhum
  corpo se move enquanto o desenho continua.
- **SC-005**: O avanço explícito de 300 quadros de 1/60 s produz o mesmo estado que 5 s de execução com laço, com
  diferença máxima de 1e-5 m.
- **SC-006**: Após 100 ciclos de inserir e remover 1 000 objetos, a memória de GPU informada pelo motor volta ao valor
  inicial (±1%) e o número de ouvintes registrados é o mesmo do início.
- **SC-007**: Os smokes de navegador e uma cena do benchmark produzem o mesmo resultado no build minificado e no não
  minificado.
- **SC-008**: Uma malha com 90 000 vértices renderiza completa e correta.
- **SC-009**: Gate completo verde, inclusive a cobertura de documentação dos exports novos.

## Assumptions

- O baseline da F0 (`bench/baselines/`) na máquina de referência é a referência de desempenho; a medição segue o
  protocolo da spec 002 sem alterações.
- O ganho de SC-001 vem só da correção da identidade e de seus efeitos; a estrutura de alocação por entidade do
  desenho permanece até a 006, então o ganho esperado aqui é parcial e a meta foi fixada de acordo.
- O limite de passos por quadro segue a prática comum de motores (ex.: no máximo 0,25 s de tempo simulado compensado
  por quadro); o valor exato fica no plano e é configurável.
- O determinismo exigido em SC-003/SC-005 vale para a mesma máquina e o mesmo navegador; igualdade entre GPUs
  diferentes não é exigida.
- Os estágios continuam com a estrutura atual (sem slots); obtêm o tempo e os recursos pela consulta ao mundo que já
  usam, até a migração da 006.
- A proibição de reuso é uma mudança incompatível aceita, alinhada à refundação; os exemplos e smokes do repositório
  já criam uma instância por objeto e são ajustados onde não criarem.
- Geometria: a C2 aloca já nesta feature os vértices e índices declarados pelas geometrias (bag inteira, como a
  refundação manda). Até a 006 migrar desenho e sombra para consumi-los, a geometria fica temporariamente duplicada na
  GPU; o aumento aparece na memória medida pelo benchmark, é declarado como limitação do motor no relatório e some na 006. (Decisão do usuário, 2026-10-06.)
