# Feature Specification: Motor puro e o app clayflow-web

**Feature Branch**: `feature/038-motor-puro-web` (criado a partir de `feature/034-refracao-fisica`; volta para ele por
merge, nunca direto para o `develop`)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Motor puro e o app clayflow-web. (1) O motor clayflow é puro — capacidades genéricas, sem
cenas nem conteúdo de demonstração; as cenas são criadas no app clayflow-web; (2) o repositório `claflow-web` vira o
clayflow-web: renomeado, as cenas antigas dele removidas, a dependência apontando para o clayflow atual; (3) saem do
motor para o clayflow-web as cenas de vídeo com o gravador e as páginas de demonstração do bench; os smokes ficam no
motor como testes dele, com as cenas mínimas de que precisam; (4) o motor ganha dois módulos de plataforma — o núcleo
puro e dois pontos de entrada, web e Deno, com os shaders importáveis nos dois; o clayflow-web usa o web; o gravador de
vídeo pode rodar pelo Deno; o motor continua cabendo nos limites portáteis do navegador; (5) compatibilidade dos shaders
com o compilador de WGSL do Deno medida por smoke. Políticas: Resource + evento + Flow, sem helpers; C3/C4 só pela C2;
cada símbolo WGSL uma vez; multiplataforma; sem regressão; fixtures regravadas só com decisão do usuário; a regra contra
travamento da GPU. Fora do escopo: as pendências abertas da 034; a documentação além do que a mudança de pontos de
entrada exige." (texto integral na mensagem da sessão de 2026-10-28)

## Contexto e Problema

O motor (`clayflow`) mistura três coisas que deveriam estar separadas:

| O que                            | Onde está hoje                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacidades do motor             | `src/` (recursos, Flows, shaders, física, luz)                                                                                                                         |
| Cenas de demonstração e de vídeo | `src/__smokes__/videoScenes.ts` (lente, dispersão, ondulação, água, molhar, cáusticas, natureza, Cornell, dia, névoa, sprites, pano e as de pendência), `bench/page/*` |
| Dependência do navegador         | Espalhada pelo núcleo: canvas, laço de quadros (`requestAnimationFrame`), redimensionamento, leitura do canvas, importação dos shaders pelo empacotador do navegador   |

O app de demonstração (`claflow-web`, React) existe à parte, mas depende de um caminho antigo do motor e tem cenas
antigas próprias. E o motor só roda no navegador: o Chrome no M4 expõe 10 buffers de storage por estágio de shader,
enquanto o Deno (WebGPU sobre wgpu) informa 31 na mesma máquina (medido em 2026-10-28) — um segundo ambiente útil para
gravar vídeos e testar fora do navegador, sem que o motor dependa de passar dos limites do navegador.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Motor sem cenas (Priority: P1)

Quem usa o motor recebe só capacidades genéricas: nenhum conteúdo de demonstração vem junto. Os testes do motor (os
smokes) continuam nele, cada um com a cena mínima de que precisa para medir uma capacidade.

**Why this priority**: É a decisão de arquitetura que as outras histórias seguem; sem ela, as cenas continuam presas
ao motor.

**Independent Test**: No motor, nenhuma cena de vídeo nem página de demonstração; a suíte de testes e os smokes que
passavam antes passam igual.

**Acceptance Scenarios**:

1. **Given** o motor depois da mudança, **When** se procura cena de vídeo ou página de demonstração nele, **Then** não
   há nenhuma — só os testes e as cenas mínimas deles.
2. **Given** a suíte de testes e os smokes que passavam no início da spec, **When** rodam depois da mudança, **Then**
   passam com os mesmos números e as mesmas imagens.

---

### User Story 2 - O app clayflow-web com as cenas (Priority: P1)

O usuário abre o clayflow-web e encontra as cenas do motor (as dos vídeos e as do bench) para ver e gravar. As cenas
antigas do app saem; o app depende do motor atual.

**Why this priority**: É onde as cenas passam a viver; sem isso, a remoção do motor perde as cenas.

**Independent Test**: No clayflow-web, cada cena migrada abre e grava o mesmo vídeo que gravava a partir do motor.

**Acceptance Scenarios**:

1. **Given** o clayflow-web, **When** o usuário escolhe uma das cenas migradas, **Then** ela abre e roda como rodava no
   motor.
2. **Given** a mesma cena gravada antes da migração (pelo motor, duas vezes) e depois (pelo app), **When** os quadros
   são comparados, **Then** a diferença app × motor fica dentro da diferença motor × motor.
3. **Given** o repositório do app, **When** se procura as cenas antigas (corpos rígidos, FEM, neve MPM do demo),
   **Then** não estão lá; o nome do app é clayflow-web e ele depende do motor atual, não de um caminho antigo.

---

### User Story 3 - O motor no navegador por um ponto de entrada web (Priority: P2)

Quem usa o motor no navegador importa o ponto de entrada web, que liga o motor ao canvas, ao laço de quadros e ao
redimensionamento do navegador. O núcleo não depende do navegador.

**Why this priority**: Separa o que é do navegador do que é do motor; é a base para o segundo ambiente.

**Independent Test**: O núcleo carrega num ambiente sem DOM; tudo que funcionava no navegador funciona pelo ponto de
entrada web.

**Acceptance Scenarios**:

1. **Given** o núcleo do motor, **When** é carregado num ambiente sem DOM, **Then** carrega sem erro.
2. **Given** uma cena no navegador pelo ponto de entrada web, **When** roda, **Then** se comporta como antes da
   mudança (mesmas imagens nos smokes).

---

### User Story 4 - O motor no Deno (Priority: P2)

Quem precisa rodar o motor fora do navegador (gravar vídeo, testar com a GPU sem o teto do navegador, um app nativo)
importa o ponto de entrada Deno: desenho numa textura lida de volta e, quando pedido, numa janela nativa.

**Why this priority**: Abre o segundo ambiente; depende da separação da história 3.

**Independent Test**: Uma cena roda no Deno e grava um vídeo; os shaders do motor compilam no compilador do Deno, com
o resultado medido por smoke.

**Acceptance Scenarios**:

1. **Given** o ponto de entrada Deno, **When** uma cena roda desenhando numa textura, **Then** os quadros lidos de volta
   formam um vídeo.
2. **Given** os shaders do motor, **When** são compilados no compilador do Deno, **Then** o smoke lista os que
   compilam e os que não, com a causa; os que não compilam são corrigidos sem mudar o resultado no navegador.
3. **Given** uma janela nativa pedida, **When** a cena roda, **Then** aparece na janela.
4. **Given** os limites do navegador e os do Deno, **When** o motor monta os pipelines, **Then** cabem nos limites
   portáteis do navegador nos dois ambientes.

### Edge Cases

- Um smoke usa uma cena que também é de vídeo: a cena mínima dele fica no motor; a de vídeo vai para o app — não há uma
  só para os dois.
- Um shader compila no navegador e não no Deno (compilador mais estrito): o ajuste não pode mudar o resultado no
  navegador (os smokes de imagem iguais).
- O Deno não tem uma capacidade que o motor usa (um formato, uma função opcional): o ponto de entrada informa o que
  falta, como no navegador, sem falha silenciosa.
- Uma cena migrada depende de um auxiliar que também servia aos smokes: o auxiliar fica do lado dos smokes; o app usa a
  API pública do motor.
- O app e o motor em versões diferentes: o app depende do motor por versão ou caminho conhecido, sem caminho antigo.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: O motor não contém cenas de vídeo nem páginas de demonstração; os smokes ficam nele com as cenas mínimas
  de que precisam.
- **FR-002**: O núcleo do motor carrega e roda sem DOM e sem APIs do Deno.
- **FR-003**: O motor tem um ponto de entrada web (canvas, laço de quadros do navegador, redimensionamento, leitura da
  imagem apresentada) e um ponto de entrada Deno (desenho numa textura lida de volta; janela nativa quando pedida).
- **FR-004**: Os shaders do motor são importáveis nos dois ambientes, sem depender do empacotador do navegador.
- **FR-005**: O repositório `claflow-web` passa a se chamar clayflow-web, sem as cenas antigas, dependendo do motor
  atual.
- **FR-006**: As cenas de vídeo e a página interativa da água passam para o clayflow-web, com o gravador de vídeo, e
  produzem quadros dentro da variação de duas gravações do motor.
- **FR-007**: O gravador de vídeo roda pelo ponto de entrada Deno, além do navegador.
- **FR-008**: Um smoke mede a compilação de todos os shaders do motor no compilador do Deno; os que falham são
  corrigidos sem mudar o resultado no navegador.
- **FR-009**: Os pipelines do motor cabem nos limites portáteis do navegador nos dois ambientes; o Deno não é usado para
  passar deles.
- **FR-010**: As políticas do motor valem nos dois ambientes: Resource + evento + Flow, sem helpers; C3/C4 só pela C2;
  cada símbolo WGSL uma vez; nada específico de um fornecedor de GPU.
- **FR-011**: Nenhuma regressão: os testes, a checagem de tipos, o lint e os smokes que passam no início da spec passam
  no fim; fixtures regravadas só com decisão do usuário.
- **FR-012**: A documentação de uso mostra os dois pontos de entrada e onde ficam as cenas.

### Key Entities

- **Núcleo do motor**: as capacidades genéricas (recursos, Flows, shaders, física, luz), sem ambiente.
- **Adaptador de plataforma**: o que o núcleo pede ao ambiente — o adaptador da GPU e o contexto de apresentação
  (decisão do usuário de 2026-10-28: padrão adapter); um para o navegador, um para o Deno.
- **Ponto de entrada web**: o núcleo com o adaptador do navegador (canvas, laço de quadros, redimensionamento, leitura).
- **Ponto de entrada Deno**: o núcleo com o adaptador do Deno (textura com leitura de volta, janela nativa).
- **Cena**: a montagem de recursos para ver ou gravar; no app (as de vídeo e demonstração) ou no motor (a mínima de um
  smoke).
- **clayflow-web**: o app com as cenas, a interface e o gravador.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 0 cenas de vídeo e 0 páginas de demonstração no motor.
- **SC-002**: O núcleo carrega num ambiente sem DOM nem Deno (0 referências ao navegador ou ao Deno no núcleo).
- **SC-003**: 100 % das cenas migradas abrem no clayflow-web, e a diferença de cada quadro gravado pelo app contra a
  linha de base fica dentro da variação da própria linha de base (decisão do usuário de 2026-10-28: a gravação não é
  determinística — duas gravações do mesmo código diferem em todos os quadros, PSNR mínimo de 52,5 dB na `agua` e 32,6 dB
  na `cornell` —, então "iguais" vale como "não piores que o motor contra ele mesmo").
- **SC-004**: Os testes, a checagem de tipos, o lint e os smokes que passavam no início passam no fim (as mesmas
  contagens e as mesmas imagens).
- **SC-005**: 100 % dos shaders do motor compilam no Deno, medido por smoke, com os smokes de imagem do navegador iguais
  depois dos ajustes.
- **SC-006**: Pelo menos uma cena com água, vidro e luz grava um vídeo pelo Deno.
- **SC-007**: 0 pipelines acima dos limites portáteis do navegador em qualquer dos dois ambientes.

## Assumptions

- "Cenas" que saem do motor são as de vídeo (`videoScenes`), a página interativa da água do bench (`bench/agua.html`)
  e a página antiga `index.html`/`src/main.ts`; o harness de benchmark (`bench/page/main.ts`, `sampler.ts`) é medida do
  motor e fica (corrigido no plano, R7); os smokes e o apoio deles (`src/__smokes__/support/*`) ficam, decisão do usuário de 2026-10-28.
- O repositório `claflow-web` (React + Vite) é o clayflow-web (decisão do usuário de 2026-10-28); o histórico dele é
  mantido.
- Os módulos de plataforma ficam no motor (decisão do usuário de 2026-10-28): o app depende do motor, nunca o contrário.
- O Deno 2.7.9 já instalado é o alvo inicial; a janela nativa do Deno depende de uma biblioteca de janela, escolhida no
  plano.
- As medidas de desempenho do bench continuam no motor (são medidas do motor); só as páginas de demonstração saem.
- As pendências abertas da 034 (o limite de buffers do traçado das sondas da GI, as cáusticas da água agitada, a película
  no vidro, o custo da marcha) ficam fora; a cena `natureza` com a luz global depende da primeira.
