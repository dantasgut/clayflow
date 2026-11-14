# Feature Specification: Padronização matemática e reuso

**Feature Branch**: `feature/037-padronizacao-matematica` (criado a partir de `feature/034-refracao-fisica`; volta para
ele por merge, nunca direto para o `develop`)

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Padronização matemática e reuso. Otimização por abstração matemática limpa e reuso, sem
recriar WGSL: código novo só quando a matemática é nova, o resto por composição. Escopo: (1) inventário das duplicatas
e variantes (matrizes, espaços e reprojeção, hash/aleatórios, cor, acumuladores temporais); (2) álgebra canônica de
transformações por classe (rígida, afim, projetiva), especialização na montagem e nunca por ramo em execução; (3)
referencial temporal único (atual, anterior e inversas calculadas uma vez) e um módulo de espaços; (4) primitivas
únicas (luminância Rec.709 linear, uma família de hash com fluxos, conversões de cor); (5) acumulador temporal genérico
com o antisserrilhado, a luz global de tela, a névoa e o filtro do sinal traçado da 034 como instâncias; (6) auditoria
de precisão dos históricos (16 contra 32 bits) medida em smoke; (7) limites reais dos adaptadores (Apple M4 e RTX
4090). Políticas: Resource + evento + Flow, sem helpers; C3/C4 só pela C2; cada símbolo WGSL uma vez; nada específico
de Mac ou NVIDIA; trajetórias físicas bit a bit; toda troca que muda resultado medida contra referência, fixtures
regravadas só com decisão do usuário; sem regressão de desempenho; critério de teste só muda com decisão do usuário.
Fora do escopo: as Fases 7–10 e as decisões pendentes da 034; as pendências de API para desenvolvedores." (texto
integral na mensagem da sessão de 2026-10-23)

## Contexto e Problema

A 034 está pausada (seção "Pausa" de `specs/034-refracao-fisica/tasks.md`). Na revisão da arquitetura dela, uma
varredura dos shaders mostrou que o reuso existe por módulo, mas a matemática de base está espalhada:

| Família                   | O que existe hoje                                                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Luminância                | Definida quatro vezes com dois pesos diferentes: BT.601 (0,299; 0,587; 0,114) num módulo de cor e Rec.709 (0,2126; 0,7152; 0,0722) em três outros. O BT.601 é de vídeo com gama; para luz linear em HDR o certo é o Rec.709. A refração e o filtro dela já usam um cada |
| Hash e números aleatórios | Cinco famílias independentes (uma por área: GI, traçado direto, partículas difusas, conjuntos, ruído)                                                                                                                                                                   |
| Inversa de matriz 4 × 4   | Três, com nomes e convenções diferentes: geral, afim e rígida — as três se justificam (a rígida é bem mais barata), mas estão soltas                                                                                                                                    |
| Reprojeção temporal       | Escrita pelo menos quatro vezes: antisserrilhado, sondas de tela da luz global, névoa e o filtro do sinal traçado da refração, cada uma com a sua leitura do quadro anterior, rejeição e acúmulo                                                                        |
| Matrizes de um objeto     | A inversa da matriz de mundo é recalculada por quem precisa (a refração usa a transposta da matriz de normais como inversa — correto, mas um truque local)                                                                                                              |

Duas suspeitas de qualidade sem medida ainda: históricos e acúmulos guardados em ponto flutuante de 16 bits podem
perder incrementos pequenos (a média com peso 1/32 para de convergir ou fica enviesada); e o teto padrão de 4 saídas
por pixel por estágio tem forçado divisões de desenho (na 034, o traçado da refração não coube com mais um dado por
pixel), sem que se saiba quanto os adaptadores reais permitem.

Terminologia desta spec: "textura" é só imagem aplicada em superfície; os resultados de cálculo guardados por pixel a
cada quadro são "alvos por pixel".

## User Scenarios & Testing _(mandatory)_

Os atores são quem desenvolve o motor (o mantenedor) e quem escreve funções e efeitos sobre ele (o autor de extensões).

### User Story 1 - Um inventário da matemática repetida (Priority: P1)

O mantenedor abre um único documento e vê, por família (transformações e matrizes, espaços e reprojeção, hash e
aleatórios, cor, acumuladores temporais), cada definição existente, onde está, quem a usa, em que ela difere das outras
e qual será a forma canônica. Um teste automático impede que uma família padronizada volte a ter duas definições.

**Why this priority**: sem o inventário completo, a padronização vira troca pontual e a deriva volta; ele também é a
base para medir a redução.

**Independent Test**: o documento lista todas as definições das famílias; o teste automático falha ao acrescentar uma
segunda definição de uma primitiva já padronizada.

**Acceptance Scenarios**:

1. **Given** o código no início da 037, **When** o inventário é feito, **Then** cada definição das cinco famílias
   aparece com arquivo, usuários, diferença em relação às outras e destino (manter, unificar, remover).
2. **Given** uma primitiva padronizada, **When** alguém escreve outra função com a mesma matemática em outro módulo,
   **Then** o teste automático falha apontando a duplicata.

---

### User Story 2 - Uma primitiva de cada: luminância, hash, cor (Priority: P1)

O autor de um efeito usa a luminância, o hash e as conversões de cor do motor e obtém sempre a mesma conta: uma
luminância para luz linear (Rec.709), uma família de hash com fluxos independentes por uso, uma conversão de cor de
cada tipo. Onde a troca muda o resultado de uma cena, a diferença é medida contra a referência e apresentada antes de
qualquer fixture mudar.

**Why this priority**: a inconsistência da luminância já existe dentro da mesma funcionalidade (a refração e o filtro
dela usam pesos diferentes); é a correção de maior valor por linha mudada.

**Independent Test**: cada primitiva existe uma vez; os smokes rodam antes e depois; as cenas afetadas têm a diferença
medida e listada.

**Acceptance Scenarios**:

1. **Given** os quatro usos de luminância, **When** a padronização termina, **Then** há uma definição e todos os
   usuários a chamam.
2. **Given** um uso que hoje aplica BT.601 sobre luz linear, **When** passa ao Rec.709, **Then** a mudança na imagem é
   medida contra a referência e a fixture só é regravada com decisão do usuário.
3. **Given** dois efeitos que sorteiam números no mesmo pixel e quadro, **When** usam a família única de hash, **Then**
   os fluxos são independentes (sem correlação entre eles) e as sequências que precisam ser bit a bit continuam iguais.

---

### User Story 3 - Álgebra canônica de transformações (Priority: P1)

O mantenedor e o autor de extensões compõem, invertem, aplicam a ponto e a direção e tiram a matriz normal de uma
transformação pela mesma família de operações, escolhendo a classe (rígida, afim, projetiva). A conta de cada classe é
a mais barata que vale para ela, escolhida quando o programa é montado, nunca por decisão em tempo de execução.

**Why this priority**: as transformações são a base de câmera, objetos, raios, nós e espaços curvos (a visão do motor
para mundos matemáticos); três inversas soltas e truques locais são a origem da deriva.

**Independent Test**: testes de equivalência contra a conta de referência (CPU, precisão dupla) para cada operação e
classe; os usuários antigos passam a usar a família sem mudar o resultado além da tolerância de arredondamento.

**Acceptance Scenarios**:

1. **Given** uma transformação rígida, afim ou projetiva, **When** é invertida pela família canônica, **Then** o
   resultado bate com a referência dentro da tolerância da classe e a classe rígida não paga a conta da geral.
2. **Given** os três lugares que hoje invertem matrizes, **When** a padronização termina, **Then** os três usam a
   família canônica e nenhum mantém uma inversa própria.
3. **Given** um programa montado para a classe rígida, **When** é inspecionado, **Then** ele não contém o caminho da
   classe geral (a especialização é da montagem).

---

### User Story 4 - Um referencial temporal e um módulo de espaços (Priority: P2)

Quem precisa da posição anterior de um objeto ou da câmera, da inversa de uma matriz de mundo, do vetor de movimento
de um ponto ou da largura do pixel num ponto encontra esses valores já calculados uma vez por quadro e uma única
definição de cada passagem entre espaços (mundo, recorte, tela). Nenhum efeito recalcula a inversa nem monta o vetor de
movimento à mão.

**Why this priority**: os históricos (antisserrilhado, luz global, névoa, refração) dependem disso; padronizar antes
do acumulador genérico evita migrar quatro cópias.

**Independent Test**: os passes de movimento e os históricos existentes passam a ler o referencial único; os smokes de
antisserrilhado e de refração dão os mesmos números; a contagem de inversões por quadro cai para uma por objeto.

**Acceptance Scenarios**:

1. **Given** um objeto em movimento, **When** um efeito precisa onde o ponto dele estava no quadro anterior, **Then**
   lê o referencial (atual, anterior, inversas) sem recalcular matriz.
2. **Given** os quatro lugares que hoje projetam ponto para a tela e montam o vetor de movimento, **When** a
   padronização termina, **Then** os quatro usam o módulo de espaços.

---

### User Story 5 - Um acumulador temporal genérico (Priority: P2)

O mantenedor descreve um sinal (o valor por pixel ou por sonda, o guia que diz se o histórico vale, a mudança da cena)
e recebe a acumulação temporal completa: reprojeção, validação, momentos, histórico encurtado onde a cena mudou e o
filtro espacial quando pedido. O antisserrilhado, a luz global de tela, a névoa e o filtro do sinal traçado da 034
passam a ser instâncias desse acumulador, não cópias.

**Why this priority**: é o maior bloco repetido e o que mais pesa na qualidade; depende das histórias 2 a 4.

**Independent Test**: cada instância migrada mantém os números dos seus smokes (dentro dos critérios atuais) e o
custo; a reprojeção e a acumulação deixam de existir fora do acumulador.

**Acceptance Scenarios**:

1. **Given** o antisserrilhado, a luz global de tela, a névoa e o filtro do sinal traçado, **When** migrados, **Then**
   cada um descreve só o seu sinal e o seu guia, e os smokes deles não pioram.
2. **Given** um sinal que não cabe no acumulador (por exemplo, acumulado por sonda e não por pixel), **When** a
   migração é avaliada, **Then** o inventário registra o porquê e o que falta ao acumulador, sem forçar a migração.

3. **Given** um histórico de qualquer domínio (pixel, célula, ladrilho, entidade de um pool), **When** declarado como
   canal temporal, **Then** a C2 aloca, gira, carimba e invalida a série, e quem consome só lê o atraso que quer.

---

### User Story 6 - Precisão dos históricos medida (Priority: P2)

O mantenedor sabe, para cada histórico e acúmulo do motor, em que precisão ele é guardado e quanto isso custa em
exatidão e em tempo: cada um é medido em smoke com 16 e com 32 bits, e a precisão escolhida é a que a medida justifica.

**Why this priority**: é uma suspeita concreta sobre os resíduos de qualidade (parada, manchas) que não custa mudar a
arquitetura para verificar.

**Independent Test**: uma tabela com cada histórico, o formato, o erro contra a referência nos dois formatos e o custo;
as trocas feitas só onde a medida mostra ganho.

**Acceptance Scenarios**:

1. **Given** um histórico em 16 bits, **When** medido em 32, **Then** a diferença de erro contra a referência e de
   custo fica registrada.
2. **Given** um histórico em que 32 bits reduz o erro além do ruído da medida, **When** a decisão é tomada, **Then** a
   troca é apresentada ao usuário com os números antes de mudar fixtures ou critérios.

---

### User Story 7 - Limites reais dos adaptadores (Priority: P3)

O mantenedor conhece os limites reais dos adaptadores de referência (Apple M4 e RTX 4090) — buffers de armazenamento e
saídas por pixel por estágio, entre outros — e o desenho passa a usar o menor dos dois, pedindo ao adaptador só o que
os dois oferecem.

**Why this priority**: orienta o desenho das histórias 3 a 5 e a retomada da 034 (o dado por pixel que faltou no
traçado da refração); não muda imagem por si.

**Independent Test**: uma tabela dos limites lidos nas duas máquinas; uma checagem de que o motor nunca pede mais do
que o menor dos dois.

**Acceptance Scenarios**:

1. **Given** as duas máquinas, **When** os limites são lidos, **Then** ficam registrados com a data e a versão do
   navegador.
2. **Given** um limite maior que o padrão nas duas, **When** o motor passa a pedi-lo, **Then** pede o menor dos dois e
   toda cena abre nas duas máquinas.

---

### Edge Cases

- Uma troca de primitiva muda trajetórias que precisam ser bit a bit (física, partículas): a troca não acontece nelas
  sem decisão do usuário; a família nova preserva a sequência antiga onde isso for exigido.
- Duas definições parecem iguais mas diferem de propósito (por exemplo, um hash que precisa de período longo e outro
  rápido): o inventário registra a diferença e as duas viram fluxos ou variantes nomeadas da mesma família, não uma
  só conta.
- Uma especialização por classe não é conhecida na montagem (a classe da transformação só se sabe em execução): fica a
  classe mais geral que cobre o caso, registrada no inventário — nunca um ramo por classe em execução.
- Um acumulador migrado fica mais caro que a cópia original: a migração não entra até o custo voltar ao do original
  (medido) ou o usuário decidir.
- Um adaptador real oferece menos que o padrão da especificação em algum limite: o desenho segue o menor e o caso fica
  registrado.
- A medida de precisão fica dentro do ruído da própria medida: nenhuma troca.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: O projeto MUST ter um inventário das cinco famílias (transformações e matrizes, espaços e reprojeção,
  hash e aleatórios, cor, acumuladores temporais) com cada definição, os usuários, as diferenças e o destino.
- **FR-002**: Cada primitiva padronizada MUST existir uma única vez, e uma checagem automática MUST falhar quando
  outra definição com a mesma matemática aparecer.
- **FR-003**: A luminância de luz linear MUST usar os pesos Rec.709 em todo o motor; a conversão para vídeo com gama,
  se necessária, MUST ser uma função distinta e nomeada como tal.
- **FR-004**: O motor MUST ter uma família única de hash e números aleatórios com fluxos independentes por uso; as
  sequências que hoje precisam ser bit a bit MUST continuar iguais.
- **FR-005**: As transformações MUST ter uma família canônica de operações (compor, inverter, matriz normal, aplicar a
  ponto e a direção) por classe (rígida, afim, projetiva), com a especialização escolhida na montagem e nenhum ramo por
  classe em execução.
- **FR-006**: Cada operação da família canônica MUST ser verificada contra uma referência de precisão dupla na CPU,
  dentro da tolerância da classe.
- **FR-007**: A matriz atual, a anterior e as inversas de objetos e câmera MUST ser calculadas uma vez por quadro e
  lidas por quem precisa; nenhum efeito MUST recalculá-las.
- **FR-008**: A passagem entre espaços (mundo, recorte, tela), o vetor de movimento e a largura do pixel num ponto
  MUST ter uma única definição usada por todos os passes de movimento e históricos.
- **FR-009**: O motor MUST oferecer um acumulador temporal genérico (reprojeção, validação pelo guia, momentos,
  histórico encurtado pela mudança da cena, filtro espacial opcional) descrito por um sinal e um guia.
- **FR-010**: O antisserrilhado, a luz global de tela, a névoa e o filtro do sinal traçado MUST ser instâncias do
  acumulador genérico, ou o inventário MUST registrar por que um deles não cabe e o que falta ao acumulador.
- **FR-017**: A C2 MUST oferecer o canal temporal: um descritor de textura ou de pool declara a profundidade da série,
  e a C2 mantém as fatias, gira o anel só quando o produtor grava, carimba cada fatia com o tempo do quadro e invalida
  a série nos eventos que quebram a continuidade (recriação, crescimento, entrada ou saída no pool, pedido explícito).
- **FR-018**: A ligação MUST escolher a fatia pelo atraso, sem cópia por quadro e sem pipeline por paridade; a precisão
  do canal (16 ou 32 bits) MUST ser resolvida pela C2 com o recuo sem `float32-filterable`.
- **FR-019**: O antisserrilhado, a luz global de tela, a névoa e o filtro temporal MUST guardar os seus históricos em
  canais temporais, com os mesmos números de smoke do portão final (bit a bit onde a conta não muda).
- **FR-020**: A energia dos corpos rígidos MUST ser uma série temporal no mesmo canal (cinética, potencial, potência e
  dissipação na janela), conferida contra uma referência f64 e contra a solução analítica do amortecimento.
- **FR-021**: Os limiares da FR-020 MUST vir do erro de arredondamento f32 das contas (racional registrado no smoke).
- **FR-022**: A energia dos corpos moles MUST ser uma série temporal no mesmo canal, por corpo: cinética, potencial no
  campo uniforme, elástica pelo modelo do algoritmo (XPBD: ½·C²/α das restrições de distância com complacência α > 0;
  MPM: o Neo-Hookean do `ParticleMaterial`, V₀·ψ(F); FEM: sem termo elástico enquanto o motor não tem o modelo
  elástico), potência e dissipação na janela; conferida contra uma referência f64 do estado lido da GPU (limiares pelo
  arredondamento f32 de cada termo e da soma), as fatias do canal contra a potência e a janela que a GPU tirou delas, e,
  no XPBD e no FEM, a lei discreta do amortecimento de cada solver (solução analítica).
- **FR-011**: Cada histórico e acúmulo MUST ter a precisão de armazenamento medida em 16 e 32 bits contra a referência
  e o custo registrado; a troca MUST acontecer só onde a medida mostra ganho além do ruído.
- **FR-012**: Os limites reais do Apple M4 e da RTX 4090 MUST ser lidos e registrados; o motor MUST pedir ao adaptador
  no máximo o menor valor dos dois em cada limite.
- **FR-013**: Toda mudança que altere um resultado observável (imagem, trajetória, número de smoke) MUST ser medida
  contra a referência e apresentada; fixtures e critérios MUST mudar só com decisão do usuário.
- **FR-014**: Nenhuma cena do bench MUST regredir mais que 10 % de tempo de GPU contra o baseline do Mac; onde a
  padronização prometer ganho, ele MUST ser medido.
- **FR-015**: O trabalho MUST seguir as regras do projeto: Resource + evento + Flow sem helpers; camadas de cima só pela
  camada de sincronização; cada símbolo de shader uma vez; nada específico de Mac ou NVIDIA.
- **FR-016**: Código de shader novo MUST surgir só para matemática nova; o resto MUST ser composição dos módulos
  existentes (dependências declaradas, pontos de extensão, constantes compartilhadas).

### Key Entities

- **Inventário**: o registro, por família, das definições, dos usuários, das diferenças e do destino de cada uma.
- **Primitiva**: uma conta de base com uma única definição (luminância, hash com fluxo, conversão de cor).
- **Classe de transformação**: rígida, afim ou projetiva; define quais operações valem e qual conta é a mais barata.
- **Referencial temporal**: para cada objeto e para a câmera, a matriz atual, a anterior e as inversas do quadro.
- **Sinal temporal**: o que um efeito descreve para o acumulador — o valor (por pixel ou por sonda), o guia que diz se
  o histórico vale e a mudança da cena.
- **Acumulador temporal**: a acumulação genérica (reprojeção, validação, momentos, histórico, filtro espacial).
- **Canal temporal**: a série de um recurso no tempo — N fatias, cabeça, quadros válidos, carimbos — mantida pela C2.
- **Limites do adaptador**: os valores reais de cada máquina de referência e o menor comum usado pelo motor.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: O inventário cobre 100 % das definições das cinco famílias encontradas na varredura do código, e cada uma
  tem destino registrado.
- **SC-002**: Ao fim, cada primitiva padronizada (luminância, família de hash, inversa e demais operações por classe de
  transformação, passagem entre espaços, vetor de movimento, largura do pixel) tem exatamente uma definição, verificada
  automaticamente.
- **SC-003**: Todos os smokes dão os mesmos números de antes, bit a bit onde hoje são bit a bit e dentro dos critérios
  atuais nos demais; toda diferença por troca de primitiva é medida, listada e só vira fixture nova com decisão do
  usuário.
- **SC-004**: Nenhuma cena do bench regride mais que 10 % de tempo de GPU contra o baseline do Mac; o ganho, onde
  existir, é medido e registrado.
- **SC-005**: A quantidade de código de shader nas famílias padronizadas não cresce; a redução é medida e registrada.
- **SC-006**: Pelo menos três dos quatro acumuladores temporais (antisserrilhado, luz global de tela, névoa, filtro do
  sinal traçado) viram instâncias do acumulador genérico sem piorar os seus smokes nem o custo além de 10 %; o que não
  migrar tem o motivo no inventário.
- **SC-007**: Cada histórico e acúmulo tem a medida de 16 contra 32 bits registrada (erro contra a referência e custo
  como fração do quadro de 60 Hz no M4).
- **SC-008**: Os limites do M4 e da RTX 4090 estão registrados, e toda cena dos smokes abre nas duas máquinas sem erro
  de limite.
- **SC-009**: A suíte completa (`npm run ci`) e os smokes passam três vezes seguidas, no fonte e com `--dist`, com zero
  erros de página.

## Assumptions

- A 037 sai do estado da 034 em `d38416d6` (inclui o filtro do sinal traçado em avaliação); se o usuário decidir
  remover o filtro na 034, ele sai também da lista de instâncias do acumulador.
- A RTX 4090 é medida pelo usuário na outra máquina; os limites dela entram quando ele os trouxer, e o desenho usa o
  menor conhecido até lá.
- "Bit a bit" vale para as trajetórias físicas e as fixtures já marcadas assim; o resto segue os critérios atuais dos
  smokes.
- A ordem das histórias (P1 antes de P2 antes de P3) é a ordem do trabalho, não um ponto de parada: tudo o que está na
  spec é implementado.
- As pendências de API para desenvolvedores (`specs/034-refracao-fisica/api-pendencias.md`) e as Fases 7–10 da 034
  ficam fora; a 037 volta para a 034 por merge.
- Os limiares seguem o princípio do projeto: exatidão contra referência; tempo como fração do quadro de 60 Hz com o M4
  como piso.
