# Feature Specification: Traçado em ondas — material fora dos laços de traçado

**Feature Branch**: `feature/039-tracado-em-ondas` (criado a partir de `feature/038-motor-puro-web`; volta para ele por
merge, nunca direto para o `develop`)

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Traçado em ondas — material fora dos laços de traçado. Base: a proposta aprovada pelo
usuário em 2026-10-29 ([proposta.md](proposta.md)). O material nos acertos dos raios deixa de ser um `switch` com um
caso por grafo expandido dentro dos kernels de traçado: o traçado só acha o acerto, a GPU separa os acertos por
material, cada grafo tem o seu sombreamento compartilhado pela GI, pelas cáusticas e pela refração, e a continuação de
cada efeito segue o raio; rebotes em rodadas fixas no orçamento atual. Fase de carga: compilar antes do primeiro
quadro visível; material novo em jogo usa as constantes até ficar pronto. Ordem: fundação → cáusticas por instância →
GI → fótons → refração → remoção do switch → fase de carga → Deno. Políticas: Resource + evento + Flow; adaptativo;
nada na CPU; AAA; fixtures e critérios do Chrome sem regravar nem afrouxar; regra dura da GPU. Fora do escopo: névoa

- cáusticas, película no vidro, pendências do fluidSurface." (texto integral na mensagem da sessão de 2026-10-29)

## Contexto e Problema

Quando um raio (da iluminação global, de um fóton das cáusticas ou da refração) acerta um objeto, o motor precisa do
material daquele objeto naquele ponto. Hoje isso é resolvido juntando **todos os materiais distintos da cena** dentro
de cada programa de traçado, escolhidos por um seletor, em todos os pontos onde o raio pode acertar algo — inclusive
dentro dos laços de rebote.

| Consequência                                                                                   | Medido                                                                                          |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| O programa de traçado cresce com o número de materiais distintos × pontos de chamada           | 7 programas de traçado afetados; a refração leva 7,1 s para compilar com 3 materiais (Deno, M4) |
| Cada material novo na cena recompila todos os programas de traçado, travando o quadro          | compilação síncrona no primeiro quadro e a cada material novo                                   |
| O compilador de GPU da Apple, pelo caminho do Deno, quebra essa forma                          | queda do compilador, código errado comprovado; o tanque de água trava a GPU no Deno             |
| Cada formato de parâmetros de material ocupa um recurso de memória em cada programa de traçado | o traçado das sondas da GI passa do teto de 10 do Chrome (11)                                   |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Materiais avaliados fora do traçado, com o mesmo resultado (Priority: P1)

Quem monta uma cena com vários materiais distintos (grafos de nós) vê a iluminação global, as cáusticas e a refração
exatamente como hoje, mas os programas de traçado não contêm mais nenhum material: cada material distinto é avaliado
por um programa próprio, pequeno, compartilhado pelos três efeitos.

**Why this priority**: É a mudança de arquitetura de que todas as outras histórias dependem, e a que tira a forma que
quebra o compilador.

**Independent Test**: Os smokes do Chrome de GI, cáusticas, refração, superfície do fluido e grafos de nós passam com
os fixtures e critérios atuais; a inspeção dos programas gerados mostra zero funções de material nos de traçado e uma
só em cada programa de material.

**Acceptance Scenarios**:

1. **Given** a cena Cornell da GI, **When** renderizada depois da mudança, **Then** a imagem fica dentro dos critérios e
   fixtures atuais, sem regravar.
2. **Given** as cenas de cáusticas (água e vidro) e as 14 cenas de refração, **When** renderizadas, **Then** passam nos
   critérios atuais.
3. **Given** uma cena com 3 materiais distintos, **When** se inspecionam os programas gerados, **Then** nenhum
   programa de traçado contém função de material e cada programa de material contém exatamente uma.
4. **Given** o mesmo material usado por mil objetos, **When** a cena é montada, **Then** existe um só programa daquele
   material.

---

### User Story 2 - O tanque de água roda no Deno (Priority: P1)

A cena do tanque com vidro e água, que hoje trava a GPU no Deno, roda até o fim e é gravada em vídeo.

**Why this priority**: É o defeito que motivou a mudança e o caminho de gravação de vídeos da 038.

**Independent Test**: Primeiro, verificação só de compilação de todos os programas da cena no compilador do Deno e
no compilador nativo da GPU (sem executar). Depois, com aprovação do usuário, uma execução na GPU com vídeo.

**Acceptance Scenarios**:

1. **Given** a cena do tanque, **When** todos os programas são compilados sem executar, **Then** nenhum falha nem
   demora mais de 2 minutos.
2. **Given** a aprovação do usuário, **When** a cena roda no Deno, **Then** os quadros terminam, o vídeo é gravado e
   nenhum processo fica preso.

---

### User Story 3 - Compilar antes de mostrar a cena (Priority: P2)

Quem carrega uma cena espera uma fase de carga: tudo o que a cena precisa é compilado antes do primeiro quadro visível,
e o motor avisa quando a cena está pronta. Um material novo inserido durante a execução não trava o quadro: o objeto
aparece com as cores constantes do material até o programa dele ficar pronto.

**Why this priority**: Depende da história 1 (só com os materiais fora do traçado os programas de traçado deixam de
depender da cena).

**Independent Test**: Medir que o primeiro quadro visível não compila nada; inserir um material novo em execução e
medir que nenhum quadro espera a compilação.

**Acceptance Scenarios**:

1. **Given** o motor iniciado, **When** nenhuma cena foi carregada ainda, **Then** os programas que não dependem da
   cena (traçado, separação, continuação) já estão compilados.
2. **Given** uma cena inserida, **When** o motor anuncia que ela está pronta, **Then** todos os programas dela estão
   compilados e o primeiro quadro não compila nada.
3. **Given** a cena rodando, **When** um objeto com um material novo entra, **Then** nenhum quadro espera a compilação
   e o objeto usa as constantes do material até o programa ficar pronto.

---

### User Story 4 - Escala com muitos materiais (Priority: P2)

Quem faz cenas com dezenas de materiais distintos não paga com programas de traçado maiores nem com recompilação de
tudo a cada material.

**Why this priority**: É o ganho de escala que a forma atual não permite; depende da história 1.

**Independent Test**: Cena de teste com 1, 3 e 16 materiais distintos; medir o tamanho e o tempo de compilação dos
programas de traçado e o custo por quadro.

**Acceptance Scenarios**:

1. **Given** cenas com 1, 3 e 16 materiais distintos, **When** compiladas, **Then** os programas de traçado são os
   mesmos nas três.
2. **Given** a cena de 16 materiais, **When** um material é trocado, **Then** só o programa daquele material é
   recompilado.

---

### Edge Cases

- **Cena sem material de grafo** (só constantes): o caminho das constantes é o único programa de material.
- **Rodada sem raio vivo**: as rodadas seguintes não fazem trabalho além do despacho vazio.
- **Material que só vale na tela** (usa derivadas de tela): continua caindo nas constantes nos acertos dos raios, como
  hoje (documentado).
- **Volumes de fluido** (campo da água): o acerto em volume entra na mesma fila, com o seu material.
- **Ramos da refração** (reflexão e transmissão na mesma interface, lobo raro): cada ramo vira um raio com o seu
  peso; o total de ramos não passa do orçamento atual.
- **Dispositivo pequeno** (teto de limites emulado): a fila e os buffers se dimensionam pelos limites do adaptador; se
  não couberem, o motor informa, sem cair em silêncio.
- **Material novo cujo programa falha na compilação**: o objeto fica nas constantes e o erro é informado.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Os programas de traçado dos raios (GI sondas e tela, refração câmera e pixels, cáusticas instâncias,
  alvos e fótons) NÃO DEVEM conter avaliação de material; DEVEM gravar o acerto (objeto, ponto, normal, coordenadas de
  textura, largura do raio, material e parâmetros do objeto, direção de chegada) para avaliação posterior.
- **FR-002**: Os acertos DEVEM ser agrupados por material na GPU, sem passar pela CPU, e cada material DEVE ser
  avaliado só sobre os seus acertos.
- **FR-003**: Cada material distinto (por código) DEVE ter um único programa de avaliação nos acertos, gerado do mesmo
  material que o desenho na tela usa, compartilhado pelos três efeitos; o caminho das constantes DEVE ter o seu.
- **FR-004**: A lógica de cada efeito depois do material (refratar, refletir, depositar o fóton, sombrear, terminar)
  DEVE ser preservada com o mesmo resultado numérico dentro dos critérios atuais.
- **FR-005**: Os rebotes DEVEM ser rodadas em número fixo igual ao orçamento atual de cada efeito; nenhum laço na GPU
  pode atravessar a avaliação de material; todo laço restante DEVE ter orçamento total de passos.
- **FR-006**: Os ramos da refração DEVEM virar raios independentes com o seu peso, limitados pelo orçamento atual.
- **FR-007**: O seletor de material composto (um caso por material) DEVE ser removido do motor.
- **FR-008**: Os programas que não dependem da cena DEVEM ser compilados na inicialização do motor.
- **FR-009**: Os programas de cada material (avaliação nos acertos e desenho na tela) DEVEM ser compilados sem bloquear
  quadros, quando o material entra no mundo.
- **FR-010**: O motor DEVE anunciar, por evento, quando todos os programas de uma cena inserida estão prontos, e
  DEVE oferecer esperar por esse momento antes do primeiro quadro visível.
- **FR-011**: Enquanto o programa de um material não está pronto, os objetos com ele DEVEM usar as constantes do
  material, nos raios e na tela, sem travar quadros.
- **FR-012**: O guardar dos programas compilados entre execuções DEVE ser capacidade opcional do adaptador de
  plataforma, usada só onde o ambiente oferecer.
- **FR-013**: Nada disso pode depender do ambiente pelo nome (navegador, Deno, fornecedor de GPU); os tamanhos vêm
  dos limites do adaptador e da cena.
- **FR-014**: Tudo como recursos, eventos e Flows do motor, sem funções auxiliares fora desse padrão; as camadas de
  cima só pela camada 2.

### Key Entities

- **Fila de acertos**: um registro por raio vivo com o que o material precisa no ponto atingido.
- **Fechamentos dos acertos**: o resultado do material por registro (difuso, especular, transmissão, emissão, índice
  de refração, rugosidade), no formato comum aos três efeitos.
- **Separação por material**: contagens, deslocamentos e índices por material, e o tamanho de trabalho de cada um.
- **Estado do caminho**: o que cada efeito guarda de um raio entre rodadas (posição, direção, peso, meios
  atravessados, orçamento restante, canal de cor).
- **Programa de material nos acertos**: um por material distinto, mais o das constantes.
- **Prontidão da cena**: o estado e o evento que dizem que todos os programas da cena estão compilados (a prontidão do motor que já existe, ampliada).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Os smokes do Chrome de GI, cáusticas, refração, superfície do fluido e grafos de nós passam com os
  fixtures e critérios atuais, sem regravar nem afrouxar.
- **SC-002**: Zero funções de material nos programas de traçado; exatamente uma em cada programa de material.
- **SC-003**: O tempo de compilação dos programas de traçado é o mesmo com 1, 3 e 16 materiais distintos; nenhum
  programa da cena do tanque leva mais de 2 minutos para compilar no Deno.
- **SC-004**: A cena do tanque roda no Deno até o fim e é gravada em vídeo, sem processo preso.
- **SC-005**: O primeiro quadro visível depois do aviso de cena pronta não compila nada; inserir um material novo em
  execução não faz nenhum quadro esperar compilação.
- **SC-006**: O custo por quadro das cenas de GI, cáusticas e refração fica dentro do orçamento atual em fração do
  quadro de 60 Hz no M4; qualquer aumento é medido e informado.
- **SC-007**: A suíte de testes, a checagem de tipos e o lint passam sem regressão.

## Assumptions

- Os fixtures atuais dos smokes do Chrome são a referência (motor contra motor); nenhum é regravado sem decisão do
  usuário.
- O orçamento de rebotes, interfaces e passos de cada efeito é o atual; esta spec não o muda.
- As ferramentas de compute que já existem no motor (compactação, soma de prefixos, argumentos indiretos) são
  reusadas.
- Execuções na GPU são uma por vez, com o usuário informado; no Deno, primeiro só compilação; a execução do tanque só
  com aprovação.
- A queda do traçado das sondas da GI para dentro dos 10 recursos do Chrome é efeito provável, medido, não requisito.
- Fora do escopo: névoa com cáusticas, película no vidro, as pendências da superfície do fluido.
