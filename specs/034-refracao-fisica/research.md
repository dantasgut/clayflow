# Research — 034 refração física e qualidade de imagem

Base: `develop` em `3a5ad83`. Levantamento de código feito em 2026-10-20 (quatro varreduras: estrutura de raios e
transmissão; antisserrilhado, movimento e sombras; luz global, névoa e cáusticas; prontidão, profiler, smokes e bench),
mais a medida das manchas (spec, Contexto). Das tentativas anteriores entram só os achados; nenhuma linha de código.

## Achados que definem o desenho

| #   | Achado                                                                                                                                                                                                                                      | Onde                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Consumidor da estrutura de raios liga 2 storage (`ray_geometry`, `ray_bvh`) + 1 uniform; cada forma distinta de função `material` soma 1 storage; luz direta com sombra soma `lights`; a água soma `field_data` e `field_materials`         | `raytrace/shaders.ts:60-97`; `ExtensionFunction.ts:381-387`; `fields/shaders.ts:67-126`                                        |
| A2  | O material nos acertos é composto pela GI (`composeHitMaterial`, `gi_hit_material`) e depende do uniform `gi` (tempo); funções com `dpdx`/`fwidth` são trocadas por constantes (H6)                                                         | `ProbeFlow.ts:157-180,486-496`; `gi_hit.wgsl:9-14`; `RaySceneFlow.ts:224,735-768`                                              |
| A3  | IOR, transmissão e dispersão só existem no `Closure` devolvido por funções `material`; `StandardMaterial` não os tem                                                                                                                        | `closure.wgsl:59-68,114-134`; `StandardMaterialSchema.ts:5-11`                                                                 |
| A4  | Transmissivos hoje: duas camadas no forward lendo `scene_copy` com mips pelo deslocamento projetado; água desloca a tela por `refraction` × inclinação lendo `water_background`                                                             | `forward_transmission.wgsl:18-66`; `water_composite.wgsl:34-89`; `WaterFlow.ts:133-150`                                        |
| A5  | Os fótons já refratam na GPU, mas com Schlick, um canal sorteado, limiar 0,5 e absorção sem distância                                                                                                                                       | `gi_photon_trace.wgsl:224-262`                                                                                                 |
| A6  | O traçador da CPU não tem dielétrico, Fresnel nem pilha de meios (tem meios participantes)                                                                                                                                                  | `lighting/reference/pathTracer.ts:26-81,430-506`                                                                               |
| A7  | O device pede o máximo do adaptador para storage por estágio; `checkLayoutLimits` lança `limit-exceeded`; a GI confere 7 antes                                                                                                              | `GpuContext.ts:17-24,90-120`; `flowBinding/limits.ts:29-65`; `ProbeFlow.ts:129,351`                                            |
| B1  | Não há jitter, matriz anterior de câmera no pool, transformação anterior nem vértices anteriores: tudo é reescrito no lugar                                                                                                                 | `camera_compose.wgsl:7-27`; `transform_compose.wgsl:13-15`; `SurfaceFlow.ts:514`                                               |
| B2  | Raios por pixel (fundo, sondas de tela, água) ignoram `p[2][0..1]` e partem do centro do pixel                                                                                                                                              | `gi_screen_common.wgsl:53-65`; `forward_background.wgsl:21-34`; `water_field.wgsl:15-37`                                       |
| B3  | MSAA 4× resolvido por hardware em cada passe; prepass só de profundidade, `@invariant` com a cor                                                                                                                                            | `RenderFlow.ts:29-43`; `forward.wgsl:17,60`; `ForwardFlow.ts:632-653`                                                          |
| B4  | Históricos próprios: GI de tela (reprojeção por posição), froxels (`mix` 0,9 fixo), cáusticas da água (0,7)                                                                                                                                 | `gi_screen_reproject.wgsl:41-71`; `media_froxel_inject.wgsl:76-88`; `caustics.wgsl:190`                                        |
| B5  | Sombra: ortográfica fixa ±10 m na origem, 1024², PCF 3×3 fixo                                                                                                                                                                               | `shadow_matrix.wgsl:6-20`; `brdf.wgsl:11-47`                                                                                   |
| B6  | "FXAA" é média de 5 taps; "SSAO" compara luminância da cor; o passe final sem efeitos faz tom + sRGB + dither (G2)                                                                                                                          | `effects.wgsl:14-23,81-96`; `PostFlow.ts:344-351`                                                                              |
| B7  | AA especular (Tokuyoshi–Kaplanyan) existe só no raster, pela normal geométrica                                                                                                                                                              | `bsdf.wgsl:179-192`; `closure_eval.wgsl:111-118`                                                                               |
| C1  | Coleta de tela: `h = min(w/(w+1), 0,97)`; 8 raios em cosseno sem contenção; filtro 5×5 σ 1,2 ladrilho quase sempre com força total; no `medium`, xadrez de meia fração (constante de tempo ~66 quadros); transitório falso com cauda pesada | `gi_response.wgsl:27-38`; `gi_screen_trace.wgsl:22-29,107`; `gi_screen_resolve.wgsl:59-104`                                    |
| C2  | Realimentação: rebatimentos g ≥ 1 leem o histórico não filtrado das sondas de tela no acerto — o erro de uma sonda vira erro correlacionado da região; sondas fixas no centro do ladrilho                                                   | `gi_screen_trace.wgsl:84-89`; `gi_probe_trace.wgsl:55-64`; `gi_screen_common.wgsl:42-45`                                       |
| C3  | Quinas: a bilinear renormalizada extrapola a sonda vizinha, a escolha tela/mundo é binária (`screen.a > 0`)                                                                                                                                 | `gi_screen_sample.wgsl:25,63-77`; `lighting/points.ts:36-39`                                                                   |
| C4  | L3 corrida real (efeito pequeno); L4 face de trás no denominador; L8 texel mais próximo; L9 pesos sem piso; L2 fator (1−f)²+f² nas cáusticas                                                                                                | `gi_probe_blend.wgsl:37-42`; `gi_screen_trace.wgsl:75-107`; `gi_generation.wgsl:22-24`; `gi_weights.wgsl:82-90`; `gi_photon_*` |
| C5  | Névoa: já tem jitter Halton e reprojeção; o ambiente dela vem só das sondas do mundo por vértice (blocos na escala da célula)                                                                                                               | `FroxelFlow.ts:399-405`; `media/points.ts:83-104`                                                                              |
| D1  | Não há estado de prontidão do motor; `createAsync(...).then` sem `catch` deixa o Flow em `preparing` para sempre; consumidor ausente espera sem aviso (H2)                                                                                  | `PipelineState.ts:345,361`; `FlowRuntime.ts:680-711`                                                                           |
| D2  | Profiler: um `mapAsync` em voo; quadros sem amostra e a última leitura repetida; quatro smokes não deduplicam por `gpuFrame` (o bench deduplica)                                                                                            | `GpuProfilerSystem.ts:198-272`; `fluidSurface.ts:506`; `bench/engines/clayflow.ts:121`                                         |
| D3  | Sementes contam quadros/dispatches, não tempo de relógio                                                                                                                                                                                    | `DiffuseFlow.ts:368`; `ProbeFlow.ts:316`; `FroxelFlow.ts:207`                                                                  |

## Decisões

### R1 — Refração como estágio próprio, em frente de onda

- **Decisão**: `Refraction` (Resource singleton, C3) + `RefractionFlow` (compute, fase forward, depois dos opacos e
  da superfície da água, antes da composição dos transmissivos e da água). O forward deixa de ler `scene_copy`: a
  camada da frente dos transmissivos e a superfície da água escrevem um pedido por pixel (posição, normal, entidade,
  meio, máscara do lobo) em texturas; o kernel traça por pixel e escreve a radiância transmitida e refletida em
  texturas de storage (`refraction_radiance`, `refraction_reflection`, rgba16f). A composição lê o próprio pixel.
- **Traçado**: frente de onda com fila compacta de pixels transmissivos (contagem por atômico, despacho indireto);
  em cada interface: Fresnel dielétrico exato; na primeira interface reflexão e transmissão são as duas traçadas;
  nas seguintes a escolha é por roleta com peso de Fresnel (sem viés), convergida pelo acúmulo da R3; acima do ângulo
  crítico, reflexão interna total. Rugosidade: amostra da distribuição visível de normais GGX (Heitz 2018) com o peso
  G1. Absorção Beer–Lambert pelo comprimento em cada meio. Dispersão: com `abbe > 0` três caminhos (um por canal) com o
  índice do canal decidido em cada interface; sem dispersão, um caminho.
- **Pilha de meios**: até 4 meios em registradores (índice por canal, absorção), meio inicial pela posição da câmera
  (consulta à estrutura e ao campo); entrar empilha, sair desempilha a entidade correspondente; interfaces coincidentes
  resolvidas pela entidade, não pela ordem.
- **Limite de interfaces**: 16 por caminho; no limite, a energia restante é contada como absorvida e um contador global
  registra a fração (smoke exige ≤ 0,1 % da energia na cena da lente).
- **Luz nos acertos opacos**: o mesmo material composto (R2 da estrutura) + luz direta com raio de sombra +
  `closure_indirect` (GI quando presente; sem ela, o hemisfério/ambiente da cena). A refração não lê nada da GI além
  da contribuição pública ao `scene_lighting`.
- **Orçamento de ligações (piso M4 = 10 storage)**: `ray_geometry`, `ray_bvh`, `lights`, fila de pixels (1), funções
  `material` (k formas), `field_data` + `field_materials` com água. Saídas em texturas de storage (fora da conta).
  Com k > 10 − 5 o kernel é dividido por grupo de formas (despacho por grupo da fila). Teste de composição confere ≤ 10
  em toda combinação dos smokes.
- **Alternativas rejeitadas**: dentro do `ProbeFlow` (acoplamento e estouro de ligações, já provado); cópia da tela
  (atalho proibido); média temporal própria (rastro — o acúmulo é o global da R3).

### R2 — Material nos acertos como módulo comum

- **Decisão**: a composição `composeHitMaterial` sai da GI para um módulo da C3 (`raytrace/hitMaterial`) com o tempo
  vindo de `ray_scene_info` (o uniform da estrutura ganha o tempo simulado); GI, fótons e refração usam o mesmo
  símbolo. A transmissão e o IOR vêm do `Closure` devolvido.
- **Footprint nos acertos (H6)**: o `SurfaceSample` ganha a largura do raio (cone de raio, Amanatides/Akenine-Möller 2019) e as derivadas de uv aproximadas; no raster, vêm das derivadas de tela. Os nós da biblioteca (ruídos, padrões)
  passam a filtrar pelo footprint (corte de oitavas, integração analítica do padrão); funções do usuário com
  `dpdx`/`fwidth` crus continuam só no fragmento (documentado), mas a biblioteca não depende mais disso.
- **AA especular nos acertos e na água**: `closure_specular_aa` com a variância da normal estimada pelo cone.

### R3 — Antisserrilhado temporal global

- **Decisão**: `TemporalAntialiasing` (Resource da C4, ligado por padrão, `antialias: 'temporal' | 'msaa' | 'off'`)
  com `TemporalResolveFlow` na fase post, antes dos efeitos; sem efeitos, o próprio resolve aplica a apresentação no
  canvas (fecha G2).
- **Jitter**: sequência Halton (2,3) de 8 posições; `CameraFlow` compõe a projeção com jitter, a sem jitter e a
  `viewProjection` anterior (o pool `CameraMatrices` ganha `previousViewProjection` e `jitter`). Prepass e cor usam a
  mesma matriz (mantém o `@invariant`). Os raios por pixel somam o mesmo deslocamento explicitamente (B2). A sombra
  gira o padrão de PCF por quadro com a mesma sequência.
- **Vetores de movimento**: alvo `motion` (rg16f) escrito pelo prepass (MRT) a partir da posição atual e anterior:
  `worldsPrevious` (cópia antes da composição no `TransformFlow`, só dos slots sujos); vértices deformados com um
  buffer anterior em anel para quem marca `produced('vertices')`; partículas e sprites por `velocity·dt`; fundo pela
  câmera.
- **Resolve**: reprojeção bicúbica (Catmull–Rom 5 taps) do histórico; rejeição por desoclusão (profundidade reprojetada
  e movimento), recorte por variância em YCoCg na vizinhança 3×3; máscara reativa para transmissivos, água e partículas
  (o conteúdo atrás muda sem o movimento da superfície); corte de câmera descarta tudo. Saída em rgba16f.
- **MSAA**: com o temporal, o MSAA sai por padrão (custo de banda); `msaa` continua opção. Se SC-004 nas bordas em
  movimento não fechar só com o temporal, a medida vai ao usuário antes de religar o MSAA por baixo.
- **Históricos próprios**: GI de tela, froxels e cáusticas mantêm o acúmulo no espaço deles (é integração de luz, não
  de imagem), mas passam a usar o jitter e a câmera anterior comuns e a rejeição por variância (R4).
- **Filtros na origem**: R2 (footprint, AA especular); sombra com PCF rotacionado + PCSS (R6).
- **Referência**: o próprio motor com 64 posições de jitter, acúmulo uniforme sem rejeição, cena parada; em movimento,
  64 sub-quadros por quadro com o tempo fracionado (desfoque de movimento real) como referência do rastro.

### R4 — Luz global sem manchas

- **Coleta de tela**: (1) amostragem por importância mista — metade dos raios em cosseno, metade guiada pela
  irradiância direcional da sonda do mundo mais próxima (com o peso MIS), e a luz direta do acerto já incluída; (2)
  contenção de cada raio relativa à média lenta da sonda (limite em σ, com a energia removida contabilizada no smoke de
  energia); (3) histerese pela variância (sem teto fixo enquanto não há transiente, até 0,995), transitório só acima
  de 4σ com σ estimado da cauda; (4) posição da sonda com jitter dentro do ladrilho (a mesma sequência da R3); (5)
  filtro à-trous guiado pela variância (3 passos, pesos de plano, normal e luminância), aplicado também ao histórico
  usado pelos rebatimentos; (6) raios pela face de trás fora do numerador e do denominador.
- **Rebatimentos**: g ≥ 1 leem as sondas do mundo (filtradas, convergidas), não o histórico de tela — corta a
  realimentação C2.
- **Quinas**: amostragem das sondas de tela com pesos de plano e normal sem renormalizar para a vizinha; onde a
  confiança cai, mistura contínua com as sondas do mundo pelo peso (fim da escolha binária).
- **Sondas do mundo**: resposta calculada num passe antes do acúmulo (L3); leitura bilinear nos rebatimentos (L8);
  piso positivo nos pesos (L9).
- **Cáusticas**: depósito e leitura em tenda 2D no plano tangente do receptor (chave com a orientação), resolve por
  h² — conserva o fluxo em qualquer altura e inclinação (L2).
- **Névoa**: ambiente dos froxels pela mesma leitura contínua das sondas (trilinear com visibilidade), histórico com
  recorte por variância.
- **Medida**: o smoke `giNoise` usa a mesma decomposição da medida do Contexto (viés por face, erro lento, cintilação).

### R5 — Prontidão

- **Decisão**: Resource `EngineReadiness` na C2 (singleton da cena), atualizado pelo `FlowRuntime` e pelo
  `PipelineState` (compilações, verificações e trocas em voo; Flows em `preparing`); eventos `enginePreparing` e
  `engineReady` com a lista do que está pendente; `Application.whenReady({ timeoutMs })` (C4) resolve no evento e
  rejeita com os nomes dos pipelines pendentes. `catch` nas cadeias de `createAsync`/`shaderMessages`: falha vira
  `engineError` com o nome; depois do descarte, é absorvida.
- **Relógio**: nunca desfeito; a simulação só avança por `step`; as sementes já contam quadros (D3) — o smoke prova
  com compilação atrasada à força.
- **H2**: consumidor ou slot obrigatório ausente emite `consumerMissing` uma vez, com o nome, e a prontidão lista o
  estágio como pendente.

### R6 — Sombra do sol

- **Decisão**: caixa ortográfica ajustada à interseção do frustum da câmera (até a distância de sombra) com a caixa da
  cena, estabilizada em texels (sem tremor ao girar); 2048²; PCF com disco de Poisson rotacionado por quadro (R3);
  PCSS com o tamanho angular do sol (0,53°) e busca de bloqueadores; bias pelo plano receptor (derivadas de
  profundidade da sombra) + bias de normal em texels. Fixtures regravadas por perfil.

### R7 — Medida de GPU

- **Decisão**: anel de 3 buffers de leitura no profiler, limite de quadros em voo, cada leitura entregue uma vez com o
  seu `gpuFrame` (evento `gpuFrameTimed`); smokes deduplicam por `gpuFrame` e exigem ≥ 90; H3/G3 medidos assim.

### R8 — Vídeo direto da GPU

- **Decisão**: ferramenta `npm run video -- <cena>` (bench/runner) + módulo de captura nas páginas
  (`src/__smokes__/support/capture.ts`): depois de cada `step`, copia o quadro apresentado (o canvas é configurado com
  `COPY_SRC` quando a página pede captura) para um buffer de leitura em anel e entrega os bytes ao runner por função
  exposta; o runner escreve no `stdin` do ffmpeg em `rawvideo`. Saídas: H.264 High 4:2:0 CRF 12 (abre no celular) e,
  opcional, FFV1 sem perdas; opcional HEVC Main10 a partir do HDR com o mesmo mapeamento de tons num alvo rgba16f.
  Começa só após `whenReady`; passo fixo de 1/60; prazo em cada processo; encerramento em `finally`; vigia de órfãos.
- **Medida**: PSNR de cada quadro decodificado contra o quadro lido (≥ 45 dB).

### R9 — As seis checagens da 011 (H4/H5)

- **Decisão**: investigação por medida antes de mexer: (1) AgX contra a curva de referência do Blender 4 (tabela de
  pontos publicada) na referência de CPU e na GPU; (2) exposição padrão e cor de limpeza (`CLEAR_COLOR` é radiância ou
  cor de tela?); (3) níveis das luzes e do hemisfério padrão; (4) especular dos materiais de teste (F0 0,04 soma um
  termo comum). Cada correção é no motor; se o motor se provar certo e o critério errado, a medida vai ao usuário.

### R10 — Referência da CPU

- **Decisão**: o traçador ganha dielétrico liso e áspero (GGX, mesma convenção de peso), Fresnel exato, pilha de meios
  independente da GPU (implementação própria, testada em unidade contra casos analíticos: placa paralela, esfera de
  Snell, ângulo crítico), Beer–Lambert, dispersão por canal e formas da água (caixa com superfície por função de
  altura).

### R11 — Água

- **Decisão**: a superfície da água (campo da 033) entra na fila da refração como interface: a composição da água lê
  `refraction_radiance`; `water_background` e o parâmetro `refraction` saem (obsoleto com aviso); as ondulações entram
  na normal da interface; cáusticas da água pela malha refratada até o receptor (razão de áreas × Fresnel × absorção,
  método físico já decidido na 011) ou pelos fótons corrigidos (R4) — escolha por medida no smoke `fluidSurface`
  (SC-017) na primeira tarefa da água.

### R12 — Limites e regressões

- **Limites**: teste de composição de todos os pipelines das cenas dos smokes contra 10 storage por estágio (piso
  M4); os pipelines novos da 034 miram 8 (padrão WebGPU) sempre que a contagem permitir.
- **Vizinhança das partículas**: só se H3 exigir; com teste de lista e trajetória bit a bit contra o `develop`,
  partículas fora da grade incluídas.
- **Bench**: `bench:check` contra o baseline do Mac a cada fase grande; nenhuma cena regride > 10 % de GPU.

### R13 — Marcações e tempos de GPU por camada (pedido do usuário, 2026-10-20)

- **Estado na C1**: os passes aceitam etiqueta e recebem par de timestamps automático (`GpuFrame.compute/render` →
  `GpuProfilerSystem.passTimestampWrites`); `stagesNs` agrega por etiqueta; `frame.marker(label, body)` abre um grupo de
  depuração (`pushDebugGroup`), mas nenhum código o chama; `frame.resolveTimestamps` é um resto morto
  (`requireQuerySetForTimestamps` devolve `null`). O WebGPU só escreve timestamps nas fronteiras de passe
  (`timestampWrites`): o tempo de um escopo é a soma dos passes dentro dele.
- **Decisão**: C1 = primitivas (etiqueta, grupo aninhado, par por passe com o caminho do escopo); C2 = política (um
  escopo por fase e por Flow em toda gravação, agregação fase → Flow → passe, entrega no `gpuFrameTimed`); C3/C4 só
  nomeiam passes. Sem profiling, só os grupos de depuração (custo de CPU desprezível, 0 consultas).

### Nota de implementação (Fase 3, 2026-10-20)

- `SurfaceSample` ganhou `footprint`, `duvdx`, `duvdy`; no raster pelas derivadas de tela (antes de qualquer ramo ou
  descarte), nos acertos por `ray_hit_closure(hit, time, width)` com a densidade de uv do triângulo
  (`ray_scene_uv_density`).
- A iluminação global passa `width = 0` nos acertos por ora (os números da 033 ficam iguais); a largura do cone das
  sondas entra junto das correções da US3, medida no `giNoise`.
- Nós `noise.value2/3`, `gradient2/3` e `fbm3` filtram pela entrada `width` (oitava → média 0 entre ¼ e ¾ de célula
  por pixel); `width` 0 dá o ruído de antes, bit a bit (hashes das fixtures iguais). O `cellular3` não filtra: a média
  dele depende do `jitter` — limitação documentada no nó.

### Nota de implementação (Fase 6, 2026-10-22)

- **Onde ficam os alvos**: no próprio `Refraction` (C3), não no `FrameTargets`: o `RefractionFlow` é C3 e não importa a
  C4 (a GI faz igual com as sondas de tela); o forward e a composição (C4) os leem pelo slot do `Refraction`.
- **Pedido**: depois dos opacos, o forward desenha os transmissivos com as duas faces (`cullMode: 'none'`), sem amostras,
  numa profundidade própria (`requestDepth`, teste `less`: a superfície mais próxima por pixel, determinística) e atrás
  dos opacos descartados pela profundidade deles (amostra 0 com MSAA). O pedido (`rg32uint`) guarda a distância à
  primeira interface e as marcas (há pedido; face de trás — a câmera dentro do meio). Com a câmera dentro d'água a
  primeira interface é uma face de trás: por isso as duas faces.
- **O raster só escolhe os pixels**: o traçado refaz o raio da câmera de cada pixel da fila (o mesmo deslocamento da
  amostra) a partir da pilha de meios inicial da câmera, como a referência da CPU. O valor traçado é o do raio do
  pixel também na borda, onde raster e raio podem discordar por arredondamento; a entidade e a normal do raster não
  são necessárias.
- **Fila**: uma invocação por pixel, contagem atômica, a fila numa textura `r32uint` (fora da conta dos 10 storage) e o
  despacho do traçado pelos argumentos indiretos (`CountToArgs`).
- **Composição**: um passe depois do `RefractionFlow` escreve a radiância e a profundidade da primeira interface (os
  passes seguintes, como a água, veem o vidro à frente); a água pelo traçado é a T065.
