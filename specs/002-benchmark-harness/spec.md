# Feature Specification: Harness de Benchmark Comparativo (clayflow vs Three.js)

**Feature Branch**: `feature/002-benchmark-harness`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Harness de benchmark comparativo clayflow vs Three.js (WebGPURenderer) — Fase F0 do
roadmap evolutivo. Objetivo: medir antes de otimizar. Cenas idênticas nas duas engines; métricas de CPU, GPU,
FPS, draw calls e memória; execução reproduzível com `npm run bench`; baseline versionado com gate de regressão

> 10%; Three.js só como devDependency do harness; extensível para novas cenas à medida que as fases avançam."

---

## Contexto e Problema

O roadmap evolutivo do clayflow (F0→F9, ver [`specs/ROADMAP.md`](../ROADMAP.md)) tem como tese ser **mais
realista e mais rápido que o Three.js** em cenas de escala (mundo aberto, multidões, simulação), oferecendo
capacidades de engine que permitam modernizar jogos como o MorphSociety (que adota o clayflow no próprio
repositório). Hoje não há **nenhuma medição** comparativa: não se sabe quanto o clayflow perde
ou ganha, em que cenários, nem se uma mudança futura (F1 completar a refundação, F2 ponte compute↔render…) melhora ou regride desempenho.

Sem um referencial reproduzível, toda afirmação "mais rápido" é opinião, e regressões de performance passam
despercebidas (o CI não tem GPU). Esta feature cria o instrumento de medição que todas as fases seguintes usam
como critério de aceite.

**Princípio norteador:** medir antes de otimizar; comparar maçã com maçã (mesma cena, mesmo hardware, mesma
janela de medição); registrar honestamente o que o clayflow ainda **não consegue** fazer.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Rodar o benchmark comparativo e obter um relatório (Priority: P1)

Como mantenedor do motor, quero rodar um único comando que execute todas as cenas de referência nas duas
engines e me entregue um relatório lado a lado (tabela legível + dados brutos), para saber objetivamente onde o
clayflow está em relação ao Three.js.

**Why this priority**: É o núcleo da feature — sem o relatório comparativo nada mais (baseline, gate) tem valor.
Sozinho já responde "onde estamos?" e orienta a priorização da F1.

**Independent Test**: Executar o comando numa máquina com navegador compatível com WebGPU e verificar que um
relatório é produzido contendo, para cada cena × engine, as métricas definidas (ou o motivo de não suporte).

**Acceptance Scenarios**:

1. **Given** uma máquina com navegador compatível com WebGPU e dependências instaladas, **When** o mantenedor
   executa `npm run bench`, **Then** todas as cenas do catálogo rodam nas duas engines, cada uma com aquecimento
   seguido de janela fixa de medição, e são gerados um arquivo de dados estruturado e uma tabela markdown.
2. **Given** o relatório gerado, **When** o mantenedor o lê, **Then** cada linha mostra cena, variante (ex.: 10k /
   100k / 1M), engine, tempo de CPU por quadro, tempo de GPU por quadro, FPS médio, p95 e p99 do tempo de quadro,
   número de draw calls e memória GPU estimada, além do perfil de hardware/navegador em que foi medido.
3. **Given** que uma cena não é suportada por uma engine (ex.: personagens animados no clayflow antes da F8),
   **When** o benchmark roda, **Then** a célula correspondente é marcada como "não suportado" com o motivo, e as
   demais cenas continuam executando normalmente.
4. **Given** o mantenedor quer medir só um subconjunto, **When** executa o comando filtrando por cena e/ou engine,
   **Then** apenas o subconjunto é executado e reportado.

---

### User Story 2 - Detectar regressão de performance contra um baseline versionado (Priority: P2)

Como mantenedor, quero comparar uma execução com um baseline commitado no repositório e ver o gate local
reprovar quando alguma métrica do clayflow piorar mais de 10%, para que nenhuma fase do roadmap degrade
desempenho silenciosamente.

**Why this priority**: Transforma a medição pontual em proteção contínua. Depende da US1 (precisa de execuções),
mas entrega valor independente: blindar a F1 em diante.

**Independent Test**: Gravar um baseline, introduzir artificialmente uma degradação (ex.: espera extra por quadro
numa cena), rodar o modo de verificação e confirmar que o gate falha apontando cena, métrica e percentual.

**Acceptance Scenarios**:

1. **Given** não existe baseline para o perfil de hardware atual, **When** o mantenedor executa o modo de
   atualização de baseline, **Then** um baseline é gravado em arquivo versionável, identificado pelo perfil de
   hardware/navegador.
2. **Given** um baseline existente para o mesmo perfil, **When** o mantenedor roda o modo de verificação e
   alguma métrica do clayflow piora mais de 10%, **Then** o comando termina com falha e lista cada regressão
   (cena, variante, métrica, valor do baseline, valor atual, variação %).
3. **Given** um baseline existente, **When** todas as métricas estão dentro da tolerância (ou melhoraram),
   **Then** o comando termina com sucesso e destaca as melhorias acima de 10%.
4. **Given** o perfil de hardware atual é diferente do perfil do baseline, **When** o modo de verificação roda,
   **Then** o gate não compara números de máquinas diferentes: avisa claramente e orienta a gravar um baseline
   para o novo perfil.

---

### User Story 3 - Adicionar uma nova cena de benchmark com pouca cerimônia (Priority: P3)

Como desenvolvedor de uma fase futura do roadmap (ex.: F5 terreno/vegetação), quero registrar uma nova cena de
benchmark descrevendo-a uma vez, com uma implementação por engine, sem tocar no executor, nas métricas nem no
relatório.

**Why this priority**: Garante que o harness acompanhe o roadmap inteiro (F1→F10), cobrindo cada nova
capacidade de engine. Não bloqueia o uso inicial, mas evita que o harness vire código descartável.

**Independent Test**: Criar uma cena trivial nova seguindo o guia, rodar o benchmark e verificar que ela aparece
no relatório e no baseline sem nenhuma alteração fora da própria cena e do seu registro.

**Acceptance Scenarios**:

1. **Given** o catálogo de cenas, **When** o desenvolvedor adiciona uma cena com identificador, descrição,
   variantes e uma implementação para cada engine, **Then** ela passa a ser executada, medida e reportada
   automaticamente.
2. **Given** uma cena nova implementada só para uma engine, **When** o benchmark roda, **Then** a outra engine
   aparece como "não suportado" com o motivo declarado, sem erro.

---

### Edge Cases

- **Navegador sem WebGPU** → o comando falha cedo com mensagem clara ("WebGPU indisponível neste navegador"),
  sem gerar relatório parcial enganoso.
- **Medição de tempo de GPU indisponível** (feature de timestamp não suportada pelo dispositivo) → a coluna de GPU
  é marcada "indisponível" para aquela execução; as demais métricas seguem; o gate ignora métricas indisponíveis
  em vez de considerá-las regressão.
- **Cena que estoura memória ou trava a engine** (ex.: 1M instâncias no clayflow antes da F2) → a falha é
  capturada, a cena é marcada como "falhou" com o erro, há tempo-limite por cena, e o benchmark prossegue nas
  cenas seguintes. Uma cena que **falhava** no baseline e passa a funcionar conta como melhoria; uma cena que
  **funcionava** e passa a falhar conta como regressão.
- **Ruído de medição** (aba em segundo plano, throttling térmico, outras cargas) → cada cena roda com
  aquecimento e várias repetições; o valor reportado é robusto a outliers (mediana das repetições), e a execução
  avisa se a dispersão entre repetições passar de um limite que torne a comparação não confiável.
- **Taxa de quadros limitada pela vsync** → o relatório deixa explícito quando o FPS está "travado" no limite do
  monitor, e prioriza tempo de CPU/GPU por quadro como métrica comparável.
- **Baseline ausente** → o modo de verificação não falha silenciosamente nem passa por omissão: informa a
  ausência e orienta a gravação.
- **Determinismo das cenas** → posições, materiais e parâmetros vêm de uma semente fixa, para que as duas engines
  e as execuções sucessivas desenhem exatamente o mesmo conteúdo.

---

## Requirements _(mandatory)_

### Functional Requirements

**Execução e catálogo**

- **FR-001**: O harness DEVE executar, por um único comando (`npm run bench`), todas as cenas do catálogo nas duas
  engines (clayflow e Three.js com renderizador WebGPU), sequencialmente e isoladas entre si (o estado de uma cena
  ou engine não contamina a próxima).
- **FR-002**: O catálogo inicial DEVE conter as cenas:
  1. **Instâncias** — mesma malha repetida, nas variantes 10 mil, 100 mil e 1 milhão, todas estáticas, mais uma
     variante de 10 mil **em movimento** (posição e rotação de todos os objetos mudam a cada quadro), que mede o
     custo de mover objetos pelos dados de intenção — o caminho de mutação reativa entregue na spec 003;
  2. **Objetos únicos** — 1 mil objetos com malhas e materiais distintos;
  3. **Luzes** — 256 luzes pontuais iluminando uma cena fixa;
  4. **Personagens animados** — 500 personagens com esqueleto e animação; no clayflow fica declarada como "não
     suportado até a F8", mas a implementação de referência no Three.js DEVE existir e ser medida;
  5. **Física** — 10 mil corpos rígidos caindo e colidindo; clayflow com sua física na GPU, e o lado Three.js com
     uma biblioteca de física de referência executada na CPU.
- **FR-003**: Cada cena DEVE ser determinística (semente fixa) e visualmente equivalente nas duas engines: mesma
  câmera, mesma resolução de renderização, mesma contagem de objetos/luzes/corpos e parâmetros equivalentes.
- **FR-004**: Cada medição DEVE ter fase de aquecimento (descartada) seguida de janela fixa de medição, com
  durações configuráveis e valores padrão documentados; DEVE haver tempo-limite por cena.
- **FR-005**: O comando DEVE aceitar filtros por cena, variante e engine, e um modo rápido (menos repetições) para
  iteração local.

**Métricas**

- **FR-006**: Para cada cena × variante × engine, o harness DEVE coletar: tempo de CPU por quadro, tempo de GPU por
  quadro (quando o dispositivo suportar), FPS médio, p95 e p99 do tempo de quadro, número de draw calls por quadro
  e memória GPU estimada.
- **FR-007**: No clayflow, o tempo de GPU DEVE ser obtido pelo profiler do motor (timestamps de GPU) cobrindo
  **todos** os passes do quadro (render e compute); no Three.js, pelo mecanismo equivalente que ele oferece.
  Quando indisponível, a métrica é registrada como "indisponível", nunca como zero.
- **FR-007a**: O motor DEVE expor, pela sua API pública, as estatísticas por quadro que o benchmark precisa e
  que hoje não existem — número de draw calls, dispatches e passes, e o tempo de GPU do quadro inteiro (hoje o
  profiler só cobre o passe forward e o evento de estatísticas sai com tempos de GPU vazios). É uma capacidade
  genérica de observabilidade do motor (útil a qualquer aplicação), desligada por padrão e sem custo quando
  desligada. Como hoje o motor cria o dispositivo de GPU sem solicitar a capacidade de timestamps (por isso o
  profiler nunca mede nada), a criação do dispositivo DEVE solicitá-la sempre que o adaptador a oferecer. A
  configuração completa do dispositivo (preferência de desempenho, demais capacidades e limites) fica para a
  fase F1 do roadmap (spec `004-core-hardening`). O tempo de CPU por quadro informado pelo motor DEVE cobrir
  também o envio à GPU dos dados de cena alterados desde o quadro anterior — desde a spec 003 esse envio acontece
  no início de cada quadro, antes da gravação dos passes —, para que o custo de mover objetos apareça na medição.
- **FR-007b**: A cena do clayflow DEVE usar o melhor caminho público que o motor oferece hoje para cada carga, e
  o relatório DEVE registrar por cena as limitações conhecidas do motor que afetam o resultado (ex.: "física com
  readback na CPU por quadro", "sem instancing no render", "um envio por objeto alterado") — a linha de base mede
  o motor como ele é, e cada fase
  seguinte demonstra o ganho contra ela.
- **FR-008**: Cada execução DEVE registrar o perfil do ambiente: adaptador de GPU, navegador e versão, sistema
  operacional, resolução, versões do clayflow e do Three.js, data e commit.

**Relatórios**

- **FR-009**: O harness DEVE exportar um arquivo de dados estruturado (máquina-legível) e uma tabela markdown
  (humano-legível) lado a lado por engine, incluindo a razão clayflow/Three.js por métrica.
- **FR-010**: Cenas não suportadas ou que falharam DEVEM aparecer no relatório com estado ("não suportado" /
  "falhou" / "tempo esgotado") e motivo, sem interromper o restante da execução.

**Baseline e gate**

- **FR-011**: O harness DEVE permitir gravar um baseline em arquivo versionado no repositório, indexado pelo
  perfil de hardware/navegador.
- **FR-012**: O modo de verificação DEVE comparar a execução atual com o baseline do mesmo perfil e terminar com
  falha quando qualquer métrica de tempo do clayflow piorar mais de 10% (tolerância configurável), ou quando uma
  cena que funcionava passar a falhar; DEVE listar cada regressão com cena, variante, métrica, valores e variação %.
- **FR-013**: O gate DEVE avaliar apenas as métricas do clayflow; os números do Three.js são referência
  comparativa e não reprovam o gate.
- **FR-014**: O gate de performance DEVE ser documentado como parte do gate local (navegador com GPU) da
  constituição — o CI sem GPU não o executa.

**Extensibilidade e isolamento**

- **FR-015**: Adicionar uma cena DEVE exigir apenas: declarar a cena (identificador, descrição, variantes,
  parâmetros) e fornecer uma implementação por engine (ou declarar "não suportado" com motivo). Executor, coleta
  de métricas, relatório e baseline NÃO devem precisar de alteração.
- **FR-016**: A cena do clayflow DEVE usar exclusivamente a API pública do motor (a mesma de um usuário), sem
  acessar internos — o benchmark mede o que o usuário obtém.
- **FR-017**: O Three.js e a biblioteca de física de referência DEVEM entrar apenas como dependências de
  desenvolvimento do harness; o pacote publicado do clayflow NÃO pode conter, importar nem depender deles.
- **FR-018**: O código do harness (cenas, adaptadores, executor, relatórios) fica isolado fora de `src/` da lib
  e NÃO entra no bundle publicado. A única mudança na biblioteca é a capacidade de observabilidade do FR-007a (incluindo a solicitação de
  timestamps na criação do dispositivo).
- **FR-019**: DEVE existir um guia curto na documentação explicando como rodar o benchmark, interpretar o
  relatório, atualizar o baseline e adicionar cenas.

### Key Entities

- **Cena de benchmark** — conteúdo de referência a medir: identificador, descrição, variantes (ex.: contagens),
  parâmetros determinísticos (semente, câmera, resolução) e uma implementação por engine ou declaração de não
  suporte com motivo.
- **Adaptador de engine** — a forma de montar, avançar quadro a quadro e desmontar uma cena numa engine
  específica (clayflow ou Three.js), expondo as métricas que aquela engine consegue informar.
- **Execução (run)** — uma rodada do harness: perfil do ambiente, configuração (aquecimento, janela,
  repetições, filtros) e o conjunto de resultados.
- **Resultado** — métricas de uma cena × variante × engine, com estado (ok / não suportado / falhou / tempo
  esgotado) e motivo.
- **Baseline** — conjunto de resultados de referência do clayflow para um perfil de ambiente, versionado no
  repositório, contra o qual o gate compara.
- **Perfil de ambiente** — identificação de hardware/navegador/SO que torna duas execuções comparáveis.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Um mantenedor obtém o relatório comparativo completo (5 cenas, 8 variantes, 2 engines) com
  um único comando, sem passos manuais além de ter um navegador compatível aberto/disponível.
- **SC-002**: Duas execuções consecutivas na mesma máquina, sem mudança de código, produzem tempos de quadro
  medianos que diferem no máximo 5% por cena — o ruído fica abaixo da tolerância do gate (10%).
- **SC-003**: Uma degradação artificial de 15% no tempo de quadro de qualquer cena do clayflow é detectada pelo
  gate em 100% das tentativas; uma execução sem mudança passa no gate em 100% das tentativas.
- **SC-004**: Adicionar uma cena nova exige alterar apenas os arquivos da própria cena e seu registro no catálogo
  (zero mudanças no executor, métricas, relatório ou baseline).
- **SC-005**: O pacote publicado do clayflow mantém a mesma lista de dependências de runtime e zero referência a
  Three.js ou à biblioteca de física de referência; o crescimento do bundle limita-se à observabilidade do
  FR-007a, e ligar/desligar essa observabilidade não altera o tempo de quadro de CPU em mais de 2%.
- **SC-006**: O primeiro relatório publicado responde objetivamente, por cena, se o clayflow é mais rápido,
  equivalente ou mais lento que o Three.js, e por qual fator — servindo de linha de base declarada para a F1.
- **SC-007**: A execução completa no modo padrão termina em até 15 minutos numa máquina de desenvolvimento típica,
  e no modo rápido em até 3 minutos.

---

## Assumptions

- **Concorrente justo**: o comparativo usa o Three.js com seu renderizador WebGPU (não o WebGL), para comparar a
  mesma API gráfica. A versão do Three.js fica fixada e registrada em cada execução.
- **Física de referência**: o lado Three.js usa uma biblioteca de física de corpos rígidos amplamente adotada e
  de alto desempenho executando na CPU (WebAssembly aceitável); a escolha concreta fica para o plano, priorizando a
  mais rápida disponível, para que a comparação não seja contra um adversário fraco.
- **Personagens animados**: o modelo animado usado pela cena 4 é um asset de licença livre/permissiva (ex.:
  amostras oficiais do formato glTF) ou gerado proceduralmente; assets não redistribuíveis (ex.: Mixamo) não são
  commitados.
- **Estado atual do clayflow**: é esperado que algumas variantes falhem ou sejam muito lentas hoje (ex.: 1M
  instâncias, já que o motor ainda não tem instancing na renderização). Isso não é defeito da feature: é
  exatamente a linha de base que a F1 deve mover.
- **Ambiente de execução**: o benchmark roda localmente num navegador desktop com WebGPU (Chrome/Edge como
  referência), conduzido automaticamente a partir do servidor de desenvolvimento; o CI não executa o benchmark por
  não ter GPU (Princípio V da constituição).
- **Tolerância**: 10% de regressão por métrica de tempo, com mediana de várias repetições; ajustável por
  configuração se o ruído de uma máquina exigir.
- **Baselines por máquina**: números de hardware diferentes não são comparados; cada perfil de máquina tem seu
  próprio baseline versionado.
- **Pré-requisito (spec 003, entregue)**: as cenas do clayflow posicionam e movem objetos só pelos dados de
  intenção (`position`/`rotation`/`scale` do `Transform`); a matriz de mundo é calculada em compute pelo motor e
  mutações em `data` chegam à GPU no quadro seguinte sem chamada manual. Cena estática não envia nada por quadro
  depois da montagem — os números estáticos medem só o desenho.
- **Escopo**: as cenas são **genéricas de engine** (instâncias, objetos, luzes, personagens, física) e
  representam padrões de carga de jogos realistas, sem conteúdo nem código de nenhum jogo específico. Novas
  capacidades do roadmap ganham novas cenas genéricas via US3 (ex.: terreno + vegetação na F5).

## Non-Goals

- Otimizar o clayflow (isso é F1 em diante) — esta feature só mede.
- Trazer código, assets ou cenas de jogos (ex.: MorphSociety) para este repositório — a adoção do clayflow
  pelo jogo acontece no repositório do jogo.
- Comparar com outras engines além do Three.js (Babylon.js, PlayCanvas) — pode virar cena/adaptador futuro.
- Rodar benchmark no CI ou em dispositivos móveis.
- Comparação de qualidade visual pixel a pixel (fica para a F4, que define a paridade visual).
