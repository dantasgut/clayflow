# Research: Refração pela estrutura de raios e as falhas antigas (034)

Levantamento feito em 2026-10-18 sobre o `develop` com a 033 (merge `3a5ad83`). As medidas das falhas vêm da bateria
rodada nesta data (`npm run smoke -- parametricSurfaces,softSurface,extensionPoints,nodeGraphs,fluidSurface --headless`).

## Estado atual

### Refração da 011 (dielétricos)

- `ForwardFlow` tira os grupos com transmissão do passe principal e grava, em `recordTransmission`
  (`src/presentation/flows/ForwardFlow.ts:707-768`): cópia da cena → camada de trás (`transmissionBack`, faces de trás
  contra a própria profundidade) → nova cópia → camada da frente (`transmissionFront`).
- A cópia (`FrameTargets.sceneCopy`) tem a resolução do canvas, com mips por compute (`scene_copy_mips.wgsl`, tenda de 4
  amostras); o amostrador é bilinear com mips.
- `forward_transmission.wgsl`: para cada canal, `refract(-v, n, 1/ior)` e projeção de `p + dir·espessura` na tela
  (`transmission_screen_uv`). Espessura pela corda de um objeto convexo simétrico em torno da origem, senão
  `transmission_depth`, senão 0,1. Rugosidade pelo mip, absorção Beer-Lambert pela corda, dispersão com três leituras
  (Abbe), parede fina com leitura sem desvio, Fresnel por `closure_under_dielectric`, reflexo por `scene_lighting`.
- Consequência (R1): a imagem refratada é a cópia da tela ampliada — bilinear sobre pixels de tela, com degraus quando a
  lente amplia; o que não está na cópia (atrás do próprio vidro, encoberto, fora do quadro) não existe; a espessura é
  uma suposição de forma.

### Refração da água

- Caminho separado: `WaterFlow` copia a cor para a textura `background` própria (sem mips, sem amostrador) e um
  triângulo de tela cheia compõe (`water_composite.wgsl:61-71`): deslocamento heurístico
  `nv.xy · refraction · min(espessura, 1) · altura`, leitura `textureLoad` (vizinho mais próximo), dispersão espalhando
  o deslocamento por canal, recuo para o pixel sem desvio se a profundidade da cena estiver à frente da água.
- A pesquisa R6 da 011 diz que a cópia da cena substituiu a da água — o código não fez isso.

### Estrutura de raios e materiais nos acertos (033)

- `ray_scene_hit` (`raytrace/ray_scene.wgsl:194`) devolve `RayHit` com posição, normal interpolada no mundo, uv,
  instância, primitiva e face; o módulo `rayScene` exige só `ray_scene_info` (consumidor `RayScene.info`) e os pools
  `ray_geometry`/`ray_bvh` — qualquer pipeline que o exija recebe as ligações da C2.
- Material no acerto: `gi_hit_closure(hit)` (`gi/gi_hit.wgsl`) monta o `SurfaceSample` sem derivadas e chama o ponto
  `gi_hit_material`, composto por cena em `ProbeFlow` (`composeHitMaterial(RayScene.materialFunctions)`). Acoplamento:
  `giHit` exige `GlobalIllumination.params` só para ler o tempo (`gi.extra.w`).
- Luz no acerto: `scene_lighting` funciona fora do desenho — a contribuição da GI usa as sondas de tela só quando
  valem no ponto (`gi_screen_irradiance(p, n).a > 0`) e cai nas do mundo; a dos meios já roda em compute
  (`media_froxel_ambient.wgsl`). O ponto `scene_lighting` é o mesmo que o desenho usa.
- Ordem: `RaySceneFlow` (fase `transform`) e as sondas (fase `shadow`) rodam antes do `forward`.

### Tempo de GPU (H1)

- `GpuProfilerSystem` tem um único staging: enquanto ele mapeia, `resolveOnto` não resolve — quadros pulados. A leitura
  (`lastFrameReading`) fica até chegar outra; `GpuEngineCore.lastFrameStats()` a mescla em todo quadro e o
  `ExecutionSystem` a emite em todo `frameComplete` — a mesma leitura repetida em vários quadros.
- O bench já descarta repetições por `gpuFrame` (`bench/page/sampler.ts`), mas recebe só os quadros esparsos; `frameMs`
  e o p95 são relógio de parede.
- Os smokes não descartam: `fluidSurface.performance36k` (média de 90 eventos, 19,23 ms nesta data), `materials`,
  `fluidField` (mediana "robusta às leituras repetidas"), `nodeGraphs`, `rayScene.stageTimes`.
- A 033 mediu por repetição no relógio de parede com cerca (`globalIllumination.ts:843-925`, `fog.ts:719-790`), em
  cópias quase idênticas dentro de cada smoke.
- Doc velha: `EngineCore.setFrameProfiling` descreve passes vazios no início e no fim; a implementação escreve nos
  passes reais.

### Falhas herdadas (medidas em 2026-10-18)

| Smoke                | Medida                                                                                                                        | Critério                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `parametricSurfaces` | lago: 0,66 % da água mais clara (63 px), 0,36 % mais escura (35 px); estados de lago, curvatura e esfera adaptativa ≠ fixture | ≥ 2 %; estado = fixture   |
| `softSurface`        | `xpbd-cloth`: corpo 46 → 189 px (sombra 570 px)                                                                               | ≥ 100 px nos dois quadros |
| `extensionPoints`    | xadrez: 0 trocas na linha; olho de peixe: 65 536 px acesos (a imagem toda), curvatura 3,34 px                                 | ≥ plano + 4; curva        |
| `nodeGraphs`         | (c) caixa 181 difere 109 (de 255) da cor do seu valor; as outras 999 conferem                                                 | ≤ tolerância              |
| `fluidSurface`       | cáusticas agitadas 1,29× / 0,78×; desempenho 19,23 ms (média de eventos com repetição)                                        | ≥ 1,3×; ≤ 16,7 ms         |

## Decisões

### R1 — Refração por raio em compute, por pixel, na resolução da tela

- **Decisão**: um estágio de compute novo (`RefractionFlow`, C3 com o passe na C4) traça, para cada pixel coberto por
  uma superfície com transmissão, o raio refratado pela estrutura de raios: entra no objeto, acha a face de saída (a
  própria geometria está na estrutura), refrata ou reflete totalmente, segue até a próxima superfície; se ela também
  transmite, encadeia; senão, calcula o material e a luz dela. O resultado vai para uma textura de radiância
  transmitida (`rgba16float`, resolução do canvas) que a camada da frente lê no próprio pixel — sem ampliar nada.
- **Por quê**: o traçado é por pixel de tela, então a nitidez não depende da ampliação da lente (SC-001); o que está
  fora da tela ou atrás do vidro vem da cena (SC-003); a espessura sai da geometria real (fim da suposição de convexo
  simétrico). Compute tem orçamento de ligações próprio — o fragmento do forward já usa muitos storage buffers (limite
  de 8 por estágio no WebGPU padrão), e um raio no fragmento disputaria esse limite.
- **Alternativas rejeitadas**: raio no fragmento do forward (orçamento de ligações e divergência no passe de desenho);
  só leitura bicúbica da cópia (some o bloco, mas a imagem continua sendo a tela ampliada e sem o que está fora dela);
  rastreio em espaço de tela pela profundidade (falha fora da tela e atrás do vidro).

### R2 — Pedido de refração escrito pela camada da frente

- **Decisão**: o passe de transmissão vira dois tempos. (a) Um passe raster das faces da frente dos materiais com
  transmissão grava, por pixel, o pedido: ponto de entrada, normal da lobo, parâmetros do dielétrico do closure (IOR por
  canal pela dispersão, cor e distância de absorção, rugosidade, parede fina, peso de transmissão) e a instância. (b) O
  `RefractionFlow` lê os pedidos. (c) A composição (a atual camada da frente) lê a radiância transmitida no pixel e
  aplica Fresnel, reflexo (`scene_lighting`), opacidade e névoa, como hoje.
- A camada de trás (`transmissionBack`) e a segunda cópia saem: a face de trás e o vidro atrás do vidro são acertos do
  raio.
- **Por quê**: o closure com transmissão só existe no fragmento do material (funções de material e grafos); o pedido
  carrega o que o raio precisa sem recompor os materiais no compute para a primeira interface.

### R3 — Material e luz no acerto: o mesmo da GI, desacoplado dela

- **Decisão**: `gi_hit_closure` e o ponto `gi_hit_material` passam para a estrutura de raios como
  `ray_hit_closure`/`ray_hit_material` (C3, `raytrace/`), lendo o tempo do recurso de tempo da cena em vez de
  `gi.extra.w`; a GI e a refração usam o mesmo. A luz no acerto é `scene_lighting(c, p, n, -dir)` — o mesmo ponto do
  desenho, com sombras, luzes, GI (sondas de tela quando valem no ponto, senão as do mundo) e cáusticas; o céu quando o
  raio escapa (`sky` pela direção).
- **Por quê**: FR-004 pede a mesma iluminação que a superfície teria vista diretamente; um único ponto evita duas
  versões da luz. A composição das funções `material` por cena já existe (033).
- **Limite**: materiais que leem derivadas de tela valem pelas constantes nos acertos (H6, fica na 012).

### R4 — Interfaces encadeadas, reflexão interna total e limite

- **Decisão**: o raio segue até `maxInterfaces` interfaces (padrão 6: entra e sai de dois vidros, mais a reflexão
  interna total), com IOR relativo entre meios (dentro/fora pela face do acerto). Reflexão interna total reflete e
  continua contando. Absorção Beer-Lambert pela distância percorrida dentro de cada meio. No limite, a radiância vem da
  leitura lisa da cópia da cena (bicúbica, B-spline em 4 leituras bilineares) no ponto projetado, deslocada pela
  profundidade da cena (busca curta ao longo do raio na profundidade).
- **Dispersão**: com dispersão (Abbe finito) três raios por pixel, um por canal; sem dispersão, um raio.
- **Parede fina**: sem desvio — o raio segue a direção da vista através da superfície, sem contar espessura.

### R5 — Rugosidade da transmissão: cone no espaço de tela sobre a imagem nítida

- **Decisão**: o raio central é nítido; a rugosidade desfoca a radiância transmitida num filtro bilateral separável em
  espaço de tela, raio = abertura do cone GGX da rugosidade × distância percorrida após a interface, projetado em pixels;
  pesos pela profundidade do acerto (não mistura fundos distantes com objetos perto).
- **Por quê**: amostrar o cone por raios pede acúmulo temporal com reprojeção (ruído no movimento); o desfoque
  determinístico preserva a nitidez da superfície lisa e não depende da ampliação (o filtro opera depois do traçado).
- **Alternativa rejeitada**: o mip da cópia por rugosidade (o atual) — volta a ler a tela ampliada.

### R6 — Água pela mesma refração

- **Decisão**: o `FluidFieldPassFlow` já escreve normal e espessura da superfície da água; o `WaterFlow` passa a gravar
  pedidos de refração (entrada pela marcha do campo, IOR do `FluidSurfaceMaterial`, absorção) e o raio dentro da água
  usa `ray_volume_hit` para achar a saída do volume e `ray_scene_hit` para o fundo — a distância dentro da água dá a
  absorção. A composição da água lê a radiância transmitida no pixel; a cópia `background` própria e o deslocamento
  heurístico saem.
- **Por quê**: FR-005; e corrige a divergência entre a pesquisa R6 da 011 e o código.

### R7 — Custo zero sem transmissão

- **Decisão**: `RefractionFlow` e a textura de radiância transmitida só existem enquanto há grupo com transmissão ou
  água (alocação `onDemand`, como os froxels da 033); o despacho é indireto pela contagem de pixels pedidos (lista
  compacta escrita pelo passe de pedidos), então a tela sem vidro não paga traçado.

### R8 — Tempo de GPU: anel de leituras, leitura entregue uma vez, mesmo código em todo backend

- **Decisão**:
  1. `GpuProfilerSystem` com um anel de stagings (4) — cada quadro resolve no próximo livre; nenhum quadro pulado
     enquanto há staging livre, e o descarte (anel cheio) fica contado.
  2. `FrameStats` de um `frameComplete` traz `gpuTimeMs`/`gpuFrame`/`stagesNs` só quando uma leitura nova chegou desde o
     evento anterior; `lastFrameStats()` continua devolvendo a última para quem consulta (HUD).
  3. Os smokes usam um coletor comum em `src/__smokes__/support/` que guarda as leituras por `gpuFrame` (cada quadro uma
     vez) depois do aquecimento (pipelines prontos e N quadros), e um medidor por repetição no relógio de parede com
     cerca (generaliza as cópias de `globalIllumination.ts` e `fog.ts`), usado para validar o tempo de GPU.
  4. Docs do `EngineCore.setFrameProfiling` corrigidas.
- **Multiplataforma** (FR-009a): nada por fornecedor ou backend — o anel, a entrega única e o aquecimento valem em
  Metal, D3D12 e Vulkan; sem `timestamp-query`, os campos ficam ausentes e os smokes medem pelo relógio de parede.
  Os patamares de clock são tratados pelo aquecimento e pela mediana das leituras distintas, não por uma constante do
  Apple. Validação na RTX 4090 pelo usuário (baseline próprio do bench).
- **Por quê**: a repetição é do nosso código (staging único + leitura persistente emitida em todo quadro), não do
  hardware.

### R9 — Falhas herdadas: causa pela bissecção, correção no motor

- **Método**: para cada falha, (1) reproduzir isolada no fonte e com `--dist`; (2) achar o commit que a introduziu por
  `git bisect` num worktree (sem symlink de `node_modules` commitado; o symlink sai antes do `worktree remove`), com o
  smoke como teste; (3) ler a mudança e medir a causa; (4) corrigir no motor; (5) registrar a causa em
  `specs/034-ray-refraction-debts/causes.md`. Critério só muda com medida que prove que estava errado.
- **Hipóteses de partida** (a confirmar na bissecção):
  - `extensionPoints`: 65 536 px acesos no olho de peixe e 0 trocas no xadrez sugerem um fundo que não é mais preto
    (céu/ambiente padrão ou mapeamento de tons) quebrando os limiares de brilho da checagem, ou a função `material` /
    `camera` do usuário deixando de ser aplicada; as fixtures de estado também divergem.
  - `softSurface` `xpbd-cloth`: 46 px no primeiro quadro medido e 189 no último — o pano horizontal visto de lado pela
    câmera no início ou a malha só aparecendo depois de cair; a sombra existe (570 px), então a simulação roda.
  - `nodeGraphs` caixa 181: uma entidade em mil com a cor errada sugere um limite de lote/página nos dados por
    instância (índice de valor por entidade ou ordem de inserção).
  - Cáusticas do lago (0,66 % contra 2 %) e agitadas (1,29× contra 1,3×): as cáusticas por fótons da 033 dependem do
    raio de coleta no hash e da escala da cena; a do lago é rasa e larga — densidade de fótons por área de água.
  - `fluidSurface` desempenho: reavaliar com a medida corrigida (R8) antes de qualquer otimização.

### R10 — Medidas da refração

- **Smoke `refraction` (novo)**: esfera de vidro maciça (IOR 1,5) sobre tabuleiro, bloco com absorção, copo d'água,
  objeto fora do quadro e encoberto, dois vidros encadeados, parede fina, dispersão, rugosidade, água do campo.
- **Referência na CPU** (`src/__smokes__/support/refractionReference.ts`): traçador analítico para esfera, bloco e
  cilindro com tabuleiro analítico e a mesma luz — cor por região (SC-002).
- **Degraus** (SC-001): ao longo das bordas das casas vistas pelo vidro com ampliação ≥ 8×, o maior salto entre pixels
  vizinhos dividido pelo da mesma borda vista sem vidro.
- **Custo** (SC-004): medidor por repetição (R8) com o vidro cobrindo um quarto da tela a 1280×720; e a mesma cena sem
  transmissão contra o `develop`.

## Adendo da implementação (2026-10-18)

- **R1/R2 — onde o traçado roda**: dentro dos estágios que desenham o que refrata, entre os passes deles — o
  `ForwardFlow` (pedidos dos transmissivos → traçado → composição) e o `WaterFlow` (pedidos da água → o mesmo traçado →
  composição). Um estágio de compute separado não teria os pipelines das funções `material` de cada entidade para a
  composição, que precisa vir depois do traçado no mesmo quadro. As texturas do traçado são alvos dos `FrameTargets`
  (sob demanda, do tamanho do canvas); a `Refraction` só tem o uniform (`maxInterfaces`, `roughnessBlur`) e fica sempre
  na cena (inserida pelos estágios padrão).
- **Dois kernels**: o traçado num kernel só passava de 10 storage buffers por estágio (o limite deste adaptador; a
  estrutura, os volumes, as funções `material`, as luzes, as sombras, a luz rebatida e as cáusticas juntos). Ficou em
  dois: o caminho (`refraction_trace_main`: geometria, volumes, fundo, reflexos do ambiente nas faces atravessadas e,
  com dispersão, a emissão por canal) e a luz da superfície vista (`refraction_shade`: `scene_lighting`). A mensagem de
  limite da C2 passou a listar os recursos contados.
- **A cópia onde ela basta (R1)**: o segundo kernel lê a cópia da cena (bicúbica) quando a superfície vista aparece
  nela (profundidade da cena no ponto projetado = a dela) e a refração não amplia (os acertos vizinhos a ≥ 0,75 texel);
  senão recalcula a luz. Com dispersão, sempre recalcula (a emissão por canal veio do primeiro kernel).
- **R3**: `ray_hit_closure(hit, time)` recebe o tempo de quem traça; o módulo lê só as instâncias (`RayHit` passou para
  `ray_common`), sem a travessia — o segundo kernel não liga a geometria.
- **Codificação do pedido**: a cor da absorção e o peso em 4 × 8 bits empacotados à mão — `pack4x8unorm` saía zerado
  no passe de pedidos (Chrome, Metal: a palavra inteira vinha 0 mesmo com o alfa literal 1).
- **Arestas do raio–triângulo**: o teste baricêntrico ganhou folga relativa (1e-5); o raio refratado que passava pela
  diagonal comum de dois triângulos não acertava nenhum (fresta visível no bloco de vidro).
- **Fundo de quem escapa**: o céu (`scene_background`) ou, sem céu, a cor de limpeza da tela (`SCENE_CLEAR_COLOR`), pelo
  uniform do quadro do traçado; o céu vem pelo slot `sky` dos estágios (sem consulta ao World por quadro).
- **R6 — a água**: um passe de tela cheia grava os pedidos da água (o mesmo formato, com a marca "entrada num volume") e
  o traçado é o dos transmissivos. O `refraction` do `FluidSurfaceMaterial` virou a escala do desvio (0,05, o padrão, é
  o físico pelo IOR; 0 não desvia — os casos de cáusticas do `fluidSurface` usam água sem desvio). O meio da água vem do
  ponto `ray_volume_medium` (IOR, Abbe, absorção) e entra na pilha dos meios; `ray_volume_transmittance` não é chamado no
  traçado (o cruzamento já diz onde a água começa e termina). O lado do volume vem da pilha: pontos novos
  `ray_volume_enter` (de fora) e `ray_volume_exit` (de dentro), sem o teste tricúbico do lado; `ray_volume_hit` (lado
  desconhecido, a luz rebatida) continua, sobre os dois.
- **Custo da água (FR-010)**: medido com a leitura corrigida (R8), a barragem de 36 864 partículas custa 12,9 ms sem o
  traçado — os 19,2 ms de partida eram a média de leituras repetidas. O traçado com a saída da água completa (marcha e
  normal tricúbica) levava a 19 ms; a saída por pontos e secante na trilinear, sem a normal (a saída vista de dentro não
  desvia o raio — aproximação registrada; a absorção para nela e o raio segue), leva a 15,1–15,3 ms, dentro dos 16,7 ms.
  As cruzadas com a água a menos de 5 mm de onde o raio saiu são a própria superfície (a do campo é achada por marcha).
- **R8 — a causa do H1**: (1) o staging único deixava o quadro sem leitura enquanto mapeava e a última leitura era
  repetida em todo `frameComplete`; (2) os smokes gravavam um quadro por quadro de tela sem esperar a GPU (`app.step` não
  espera): com a GPU mais lenta o trabalho acumulava, as leituras chegavam cada vez mais tarde e o anel ficava sempre
  ocupado (no `fluidSurface`, nenhuma leitura nova depois do quadro ~100). O coletor espera `readyForFrame` (como o laço
  e o bench). O anel marca um staging como ocupado só no envio — marcar no resolve prendia o de uma gravação não enviada.
