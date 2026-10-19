# Research: Correções da validação na RTX 4090

Decisões técnicas da [spec](spec.md), com base na [análise](analise.md). Cada decisão diz o que foi escolhido, por
quê e o que foi descartado.

## R1 — Amostragem por importância guiada pelas sondas do mundo (L1, FR-001)

**Decisão (revista pela medida, 2026-10-19)**: os raios das sondas de tela continuam traçados até o fim, mas as direções
são amostradas por importância, sem viés:

- o hemisfério é dividido em 8 × 8 células de mesma probabilidade sob o cosseno;
- cada célula recebe como guia a radiância das sondas do mundo no centro dela (atlas filtrado, pesos das sondas
  calculados uma vez por sonda);
- cada raio escolhe a célula pela mistura defensiva q = 0,3/64 + 0,7 · guia/total, estratificada entre os raios da
  sonda, e um ponto dentro dela;
- o peso é 1/(64·q): o estimador continua exato, e o guia só muda a variância.

Os raios vão mais para a janela e para a mancha de sol, as fontes pequenas e fortes.

**Medido** (`giNoise`, `medium`, 8 raios):

- manchas: 1,36× → 0,84× a referência;
- variação entre quadros: 0,663 % → 0,123 % (média de 10 pares);
- Cornell contra o traçador: pior região 6,5 % → 6,0 %.

**Descartado, medido**:

- **Campo distante pelas sondas do mundo** (a primeira versão desta decisão, "Lumen"). Tirava as manchas (0,80×), mas a
  radiância suavizada pelo lóbulo das sondas, lida num ponto mais perto da fonte, soma luz a mais: na Cornell, chão e
  bloco baixo ficaram 15 % claros demais.

## R2 — Histórico próprio do acúmulo de tela e deriva (L1, FR-002)

**Decisão**:

- O teto da histerese das sondas de tela sai da `hysteresis` das sondas do mundo e vira `screenHistory` (atualizações
  lembradas com a luz parada: `low` 64, `medium` 256, `high` 1024). O acúmulo já tinha estado próprio e a regra
  `h = min(N/(N+1), teto)`; o teto passa a N_max/(N_max + 1).
- A regra de resposta ganha a **deriva**: com a média rápida a mais de 2,5σ + 1,5 % da lenta, abaixo do limiar de
  mudança, a contagem fica em no máximo 32 (a memória da histerese 0,97). É o caso das mudanças graduais (a cortina
  andando), que o detector de mudança não pega.
- A deriva fica na referência de CPU (`reference/response.ts`) e no WGSL (`gi_response.wgsl`).

**Medido**:

- sem a deriva, o histórico longo atrasava o `living` (94,6 % da mudança em 0,25 s); com ela, passa;
- a deriva não muda a variação entre quadros na cena parada (0,106 % contra 0,104 %).

## R3 — Contenção de firefly (L1, FR-003) — descartada

Medida: um teto relativo de 8× a média corta luz legítima. O emissor visto de perto na Cornell ficou 23–68 % escuro
demais, e o viés passa do SC-002. A amostragem guiada (R1) trata as fontes pequenas e fortes sem viés.

## R4 — Filtro espacial (L1, FR-004) — mantido o da 033

Medido:

- **Anel à-trous de 2 passos com peso de luminância guiado pela variância:** variação entre quadros 0,100 %, mas manchas
  1,04×.
- **5 × 5 com o mesmo peso:** manchas 1,28×. A estimativa de ruído da sonda fica abaixo do resíduo verdadeiro, e o peso
  de luminância preserva as manchas.

O filtro gaussiano da 033 deu o melhor resultado nas manchas e ficou.

## R5 — Raios pela face de trás (L4, FR-005) — descartada

Medido: tirar esses raios da média deixou o bloco baixo da Cornell mais claro que a referência (6,5 % → 8,0 %). Na
sonda de tela, um raio que acerta a face de trás entrou numa geometria fechada: zero é a luz certa naquela direção.
A auditoria valia para as sondas do mundo, que podem estar dentro da parede.

## R6 — Cáusticas que conservam o fluxo (L2, FR-006)

**Decisão**: depósito e leitura passam a ser no plano tangente. No depósito vai junto o eixo dominante da normal (o
fóton guarda a normal do acerto).

- O splat é bilinear nos dois eixos perpendiculares e pega a célula mais próxima no eixo da normal.
- A leitura usa a mesma base.
- A área da célula atravessada pelo plano é `h² / |n_dominante|`.
- O peso no eixo normal é 1 nas duas pontas, e o fluxo integrado fica igual ao depositado em qualquer altura.

**Descartado**:

- Guardar a soma dos pesos por célula: mais memória, e ainda erra na inclinação.
- Hash 2D por superfície: exige identificar a superfície no hash.

## R7 — Resposta das sondas num passe próprio (L3, FR-007)

**Decisão**: `gi_probe_response_main`, uma invocação por sonda agendada, roda antes do blend. Calcula o estado e o
`h` do quadro e grava `gi_probes[i].response` mais o `h` num buffer; o blend só lê. Sem barreira de workgroup e sem
leitura e escrita no mesmo kernel.

## R8 — Prontidão do motor e física que espera (S2, FR-026; decisão do usuário)

**Decisão**:

- A C2 expõe prontidão: `app.ready(): Promise<void>` e o evento `ready`. Está pronto quando nenhum Flow está em
  `preparing` e o core não tem verificação (`getCompilationInfo`) nem compilação em voo; `pendingPipelines` já existe.
- Os estágios da física declaram os estágios de colisor de que dependem.
- Enquanto um colisor obrigatório não está pronto, o passo da física não avança e o `Time` não acumula o passo. A
  cena aparece parada.
- `PipelineState.createPipeline` trata a rejeição quando o token mudou ou o core está fechando.
- O `settle` dos smokes aguarda `app.ready()`.

**Por quê**: o usuário escolheu que a física espere; o resultado fica igual em qualquer máquina.

## R9 — "Nada mudou" por revisão (D2–D4, D7, FR-012/013)

**Decisão**: cada entrada de um passe caro ganha um contador de revisão na C2, e o Flow guarda a última revisão
consumida e pula o dispatch quando nada mudou. As entradas são:

- o pool de `WorldTransform` (bitset de sujo já existente);
- `Time.steps` da simulação;
- a geometria produzida pela GPU (`isProduced`);
- os dados da luz e do mapa de sombra.

O envelhecimento da BVH conta só refits feitos. A GI que sai ou com `enabled: false` desfaz pelo mesmo evento o que
a entrada fez, guardando o que ela própria inseriu.

## R10 — As seis checagens de S1: motor conferido, medida na radiância (S1, FR-025)

**Conferido no motor (2026-10-19)**: o AgX do motor (WGSL e referência de CPU) é a aproximação polinomial do Blender
4 / Sobotka (Wrensch): mesmas matrizes de entrada e saída, faixa de EV −12,47 a +4,03, mesmo polinômio, `pow 2,2`. As
falhas vêm do desenho do AgX (escuros levantados, cores saturadas puxadas para o branco, contraste comprimido nos
realces) e do especular físico do dielétrico (F0 = 0,04) sob a luz da cena.

**Decisão do usuário (2026-10-19): medir a radiância.** Os smokes leem o alvo HDR linear antes da apresentação (como
os da 033) e mantêm os limiares originais das specs:

- **Cáusticas agitadas** (`fluidSurface`) e **lago** (`parametricSurfaces`): razões na radiância; a seleção dos
  ladrilhos e da água continua pela tela.
- **Caixa 181** (`nodeGraphs`): cada caixa é a cor dela mais o termo comum medido (a mediana de radiância − cor, o
  especular), a ±1/255.
- **Xadrez e olho de peixe** (`extensionPoints`) e **pano** (`softSurface`): os limiares originais, calibrados para a
  saída linear de antes da 011, aplicados à radiância em 0–255 (`linearImage`).

**Medido**:

| Checagem              | Radiância                    | Antes da 011  |
| --------------------- | ---------------------------- | ------------- |
| Cáusticas agitadas    | 2,49× / 0,52×                | 1,31× / 0,37× |
| Lago (claro / escuro) | 24,3 % / 28,4 %              | 20 % / 28 %   |
| Caixa 181             | 0,08/255 (termo comum 0,060) | 0,53          |
| Xadrez                | 8 trocas                     | 8             |
| Olho de peixe         | 5,60 px                      | 5,38 px       |
| Pano                  | 7315 px                      | 7378 px       |

As fixtures de estado da 4090 de `extensionPoints` e `parametricSurfaces` foram gravadas, nunca existiram, e
reproduzem.

## R11 — Profiler com a CPU à frente (S3, FR-027a)

**Decisão**: o `GpuProfilerSystem` passa de um staging a um anel de 3. Quando os três estão em voo, o quadro grava a
consulta sem resolver, perdendo a amostra em vez de travar, e o `dispose` espera os maps pendentes. O smoke de
desempenho cadencia por `onSubmittedWorkDone` até ter 30 amostras ou mais.

## R12 — Bench sem teto de 60 FPS (V3, FR-028)

**Decisão**: primeiro medir a hipótese da emulação de viewport (`orchestrate.ts:63`): `viewport: null` com
`--window-size`, como no `npm run video`. Se não for ela, comparar as flags do Chrome uma a uma, inclusive
`--disable-gpu-vsync` sob Vulkan/X11, e o compositor. O clock da GPU é registrado no resultado (`nvidia-smi`) para
descartar medidas em P8.

## R13 — Módulos WGSL únicos (M1, FR-020)

**Decisão**:

- Os módulos compartilhados ficam em `src/elements/gpu/wgsl/math/`:
  - `hash.wgsl` (Teschner, PCG, chave de célula);
  - `half.wgsl`;
  - `basis.wgsl`;
  - `fullscreen.wgsl` (vertex de tela cheia).
- A checagem de duplicatas é um teste Vitest: normaliza o corpo de cada `fn` (espaços e comentários) e falha com
  duas iguais em arquivos diferentes.

## R14 — Divisão dos objetos-deus (M2, FR-022)

**Decisão**:

- `ResourceSystem` passa a `PoolStore`, `OwnAllocator`, `UploadQueue`, `ReadbackService`, `OwnershipRegistry` e
  `SlotRefPatcher`, com o `ResourceSystem` como fachada.
- `ForwardFlow` passa a `SceneCopyMips`, `TransmissionLayers`, `PipelineVariants` e `GroupRecorder`; o
  `GroupRecorder` é compartilhado com `ShadowFlow`.
- Refatoração pura: as trajetórias e fixtures ficam bit a bit.

## R15 — Refração traçada (US7, FR-031–FR-031d; R1 da 011)

**Decisão**: a refração passa a ser um caminho de raios na estrutura da 033, sem a cópia da tela.

- O raio refratado em `forward_transmission.wgsl` (`:38`, `:100`) vai para `ray_scene_hit`.
- Em cada acerto transmissivo, o Fresnel decide por amostra entre refletir e refratar. A outra opção é seguir os dois
  ramos com peso até a energia restante cair abaixo de 1 %.
- O laço só para numa superfície que não transmite, ou por energia; o limite fixo de interfaces sai.
- No acerto final, o material e a luz (direta pela sombra mais a indireta pelas sondas) vêm do kernel de acertos da GI.
- **Rugosidade**: as direções de microfaceta são amostradas pela GGX (VNDF) com a densidade correta. A convergência
  vem do acúmulo temporal com reprojeção da 033, sem desfoque.
- **Reflexo das faces atravessadas**: o ramo refletido é traçado (`ray_scene_hit`), não lido do ambiente.
- **Dispersão**: três raios (R, G, B), cada um com o IOR do seu canal e iluminado no próprio acerto. Com MSAA, por
  amostra.
- **Sem acerto**: o céu ou o ambiente na direção do raio (o que de fato está lá), nunca a cópia da tela.

**Arquitetura (2026-10-19)**:

- **Ponto de cena `scene_refraction(pixel) → vec4`** (C3, como o `scene_lighting`): a radiância que atravessa a primeira
  interface no pixel (rgb) e se é válida (a). O pronto devolve 0. O passe da frente dos transmissivos soma o rgb à luz
  refletida da própria superfície e não lê mais a cópia da tela para refratar. A cópia continua só na opacidade (o
  recorte alfa sem refração, em que o fundo na tela é o que de fato está atrás).
- **Kernel `gi_refraction_main` na `GlobalIllumination`**, composto com as funções `material` da cena como os outros
  kernels de acerto. Por pixel:
  - o raio da câmera; se o primeiro acerto não é transmissivo, a = 0;
  - na primeira interface, refrata com peso (1 − F), porque o reflexo dela é do desenho;
  - nas seguintes, Fresnel escolhe entre refletir e refratar, e assim o reflexo das faces atravessadas é um raio traçado;
  - micro-normal pela GGX (VNDF), Beer–Lambert no trecho, um raio por canal com número de Abbe;
  - na superfície que não transmite, `scene_lighting` + emissão: a mesma luz que o desenho daria a ela;
  - sem acerto, `scene_environment`.
- **Acúmulo temporal** com reprojeção pelo primeiro acerto: rugosidade e dispersão convergem sem desfoque.
- **Modo só refração (decisão do usuário, 2026-10-19)**: com material transmissivo e sem `GlobalIllumination`, o motor
  insere uma com a luz indireta desligada. A estrutura de raios e a refração ficam ligadas; o hemisfério continua.

**Custo (medido na 4090, 2026-10-19)** — sem aproximação, cada passo medido antes e depois:

- **Bandeira**: o passe só roda com material que refrata na cena (os estágios padrão escrevem `refraction` na GI).
- **Ladrilhos de 8 × 8**: 4 raios estratificados por ladrilho e o quadro anterior dele; só os pixels com um ladrilho
  marcado na vizinhança 3 × 3 traçam (21,6 → 20,8 ms no `fluidSurface`).
- **Frente de onda**: o passe por pixel anda até 3 trechos de cada caminho; os que continuam vão para uma fila e um
  despacho indireto os termina (um fio por caminho), e a média temporal é um passe à parte. Os fios de um grupo não
  esperam o caminho mais longo dele (na água agitada, 1 % dos pixels faz 15–54 trechos). Fila cheia: o caminho
  termina no próprio fio, com o mesmo resultado.
- **Uma chamada de cada função grande**: o WGSL copia a função em cada chamada; a amostra e o trecho chamados de dois
  lugares cada quadruplicavam o kernel (registradores, ocupação). Um laço só para as tentativas na silhueta e para o
  trecho (20,9 → 15,2 ms no `fluidSurface`).
- O raio primário custa 0,8 ms a 64k (reaproveitar o passe de câmera do campo não compensa); o resto é o caminho,
  ~2/3 dele os dois canais extras da dispersão da água (Abbe 55,7) — mantidos exatos por decisão do usuário.

**Descartado** (todos atalhos da tentativa descartada):

- a cópia da tela no limite de interfaces;
- a bicúbica da cópia como reserva, que esta análise chegou a propor;
- o desfoque bilateral para a rugosidade;
- o reflexo do ambiente nas faces;
- a dispersão iluminada na superfície do verde.

**Cuidado**:

- O custo por pixel transmissivo entra no orçamento; medir na cena de vidro e no `bench:check`.
- Os acertos não têm derivadas de tela (H6): materiais com `dpdx`/`fwidth` valem pelas constantes, como nos raios
  da GI.

## R16 — Água: saída do volume e normal limpa (US7, FR-031d, FR-031e)

**Decisão**:

- O raio que deixa a água (`water_*`, `FluidField`) usa a normal da superfície de saída (o gradiente do campo de
  distância no ponto de saída), o Fresnel e a reflexão interna total.
- Dentro do volume, a absorção pela distância percorrida.
- A normal ruidosa é tratada na origem:
  1. medir o erro do campo depois do redistanciamento (`FluidFieldFlow`, 6 iterações) contra a distância exata numa
     referência de CPU;
  2. corrigir o redistanciamento (iterações, esquema, banda) até o gradiente ficar dentro da tolerância.

  Sem filtro na normal.

## R17 — Tempo de GPU por quadro (FR-027b, FR-027c; H1, H7)

**Decisão**:

- Uma consulta de timestamp no início e outra no fim do quadro, resolvidas num anel de 3 stagings (R11).
- Leitura com 2–3 quadros de atraso, e cada amostra marcada com o quadro de origem: nunca repetir uma leitura velha.
- Os smokes de desempenho leem essa medida, cadenciados até ter 90 amostras ou mais.
- Com ela, medir a água a 64k contra o `develop` (H7) e explicar qualquer diferença pela causa.
