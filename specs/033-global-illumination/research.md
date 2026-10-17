# Research — 033 Iluminação global

Levantamento na `develop` após o PR #47 (011, US1–US3, 2026-10-17). Revisão no mesmo dia: o usuário pediu campo de
distância para os fluidos e névoa volumétrica sem pixelização (R11, R12, adendo de R1). Achados (A) com evidência; decisões (R) com
alternativas.

## Achados

- **A1 — Vértice de 32 B e índices u16/u32.** Toda geometria tem `posição, normal, uv` em 32 B compactos
  (`StructSchema.vertexLayout`, `scene/descriptors/StructSchema.ts:336`; `MeshVertexSchema` lê em compute). Índices
  `Uint16Array` até 65 535 vértices e `Uint32Array` acima (`Geometry.ts:82-97`); superfícies e grafos forçam u32; o
  buffer de índices é alinhado a 4 B (u16 lidos aos pares num kernel). Os buffers de vértice/índice/indireto já têm
  `STORAGE` no uso (`GpuEngineCore.ts:35-50`): ligáveis em compute sem cópia.
- **A2 — Conteúdo compartilhado.** A chave de conteúdo (hash dos bytes) compartilha vértices e índices entre entidades
  (`ResourceSystem.ts:1589`); superfícies, grafos e corpos moles têm buffers próprios — favorece uma BLAS por conteúdo e
  instâncias na TLAS.
- **A3 — Geometria escrita na GPU.** `ParametricSurface` (`SurfaceFlow`), `GraphGeometry` (`GraphFlow`),
  `PointCloudGeometry` (`EmitterFlow`, `DiffuseFlow`) com `upload: 'never'` e `owns`; `SurfaceGeometry` dos corpos moles
  com `upload: 'initial'` e escrita pelo `SoftSurfaceFlow`. `hasGpuWriter` existe; **nenhum estágio de geometria marca
  `produced('vertices')`** (só a água usa `isProduced`) — o refit precisa dessa marca.
- **A4 — Contagem só na GPU.** Malha adaptativa e grafos declaram `indirect` (`count: 2`): os triângulos reais são
  `indirect[0] / 3`, lidos na GPU; vértices e índices ficam na capacidade.
- **A5 — Registro `Renderable`.** `transformSlot`, `materialSlot`, `fnSlot`, `diffSlot` (`elements/scene/Renderable.ts:14`),
  pelos `slot.entities({ record: renderableRecord })` (os pools são compartilhados pela chave): a TLAS lê o mesmo registro
  do forward.
- **A6 — Ordenação radix.** `RadixSort` (`elements/gpu/compute/RadixSort.ts`) ordena chaves u32 com valores u32, estável e
  determinística, com contagem na GPU — serve ao Morton de 30 bits com índices. `Reduce` é escalar (caixa da cena exige
  kernel próprio ou seis reduções); `PrefixSum` e `Compaction` existem.
- **A7 — Partículas sem raio próprio.** `pos.xyz` no início do registro de todo corpo de partículas; o raio vem do
  `FluidSurfaceMaterial.particleRadius` ou de `ParticleMaterial.particleSpacing × 0,8` (`FluidSurfaceFlow.ts:603`); a
  faixa do corpo pelo `poolRangeOf`.
- **A8 — Ponto `material` não é de cena.** Por entidade (`context: 'fragment'`), um pipeline por função
  (`forwardMaterialAdapter`); o ponto `field` compõe várias funções com sufixo de hash (`combineFields.ts`) — o modelo
  para compor as funções `material` num kernel; grafos com nós só de fragmento não montam em compute.
- **A9 — Limites.** Os limites de escala são pedidos no máximo do adaptador (`GpuContext.ts:17-98`); os layouts são
  conferidos contra `maxStorageBuffersPerShaderStage` — ligar um buffer de vértices por geometria na travessia esbarra
  no limite: as primitivas vão para buffers únicos.

## Decisões

### R1 — Estrutura de raios: BVH de dois níveis construída na GPU

**Decisão**: BVH em dois níveis, toda em compute:

- **Nível de baixo (BLAS)**, um por conteúdo de geometria (a mesma chave de conteúdo da 007 compartilha a BLAS):
  triângulos da geometria (vértices e índices que a C2 já aloca, escritos pela CPU ou pela GPU: um kernel por geometria
  os copia para o buffer **único** de primitivas da cena em espaço de objeto, A9; u16 lidos aos pares, A1; contagem do
  registro indireto quando há, A4) ou esferas (partículas dos corpos: `pos` e o raio do material, A7). Construção LBVH (Karras 2012): caixa por primitiva → código de Morton de 30 bits
  na caixa da geometria → ordenação radix (a primitiva já existente) → hierarquia por prefixos comuns → caixas de baixo
  para cima com contadores atômicos. Geometria deformável (escrita na GPU no quadro) é **reajustada** (refit: só as
  caixas, de baixo para cima) a cada quadro em que é produzida — os estágios de geometria passam a marcar
  `produced('vertices')` (A3); a topologia nova (contagem, índices) **reconstrói**.
- **Nível de cima (TLAS)**, sobre as instâncias desenhadas (o registro `Renderable`: geometria, matriz de mundo,
  material): reconstruído por LBVH a cada quadro sobre as caixas de mundo das instâncias (dezenas de milhares de folhas
  custam pouco), lendo as matrizes do pool `WorldTransform` produzido na GPU.
- **Travessia**: pilha curta por invocação (32 entradas), raio–caixa (lâminas), raio–triângulo (Möller–Trumbore com
  arestas em precisão estável) e raio–esfera; resultado: distância, primitiva, instância, coordenadas baricêntricas →
  ponto, normal interpolada e o registro do material.
- **Contrato**: módulo WGSL `ray_scene` (`ray_scene_hit(origin, dir, t_max) -> RayHit`, `ray_scene_occluded(...)`),
  recursos declarados da estrutura; qualquer estágio o requer sem conhecer a geometria de origem (FR-003; usado depois
  pelo R1 da 011).

**Alternativas**: campo de distância com sinal (SDF) por objeto ou global — consulta barata, mas paredes finas e
geometria arbitrária (grafos, panos) viram aproximação e vazam luz; voxels (cone tracing) — vazamento e serrilhado nas
paredes finas, memória cúbica; BVH de um nível sobre todos os triângulos — reconstrução inteira a cada movimento de
qualquer instância; BVH construída na CPU — exige leitura de volta da geometria escrita na GPU (proibido).

### R2 — Transporte: sondas com rastreamento e amostragem das fontes (difuso) + fótons das fontes (cáusticas)

**Decisão**: os dois sentidos do transporte de luz, cada um onde é forte:

- **Luz difusa rebatida — sondas (DDGI, Majercik et al. 2019)**: uma grade de sondas no espaço; cada sonda lança raios
  (distribuição esférica girada a cada quadro); em cada ponto atingido, a radiância que sai é a luz direta naquele ponto
  (amostragem das fontes pela potência + o céu, com raio de sombra pela estrutura) refletida pelo material **mais** a
  irradiância das sondas do quadro anterior naquele ponto (cada quadro soma um rebatimento: N quadros = N rebatimentos,
  convergindo à série completa). Os raios que escapam leem o céu. A sonda guarda, em mapas octaédricos, a irradiância
  (cosseno) e a visibilidade (média e média do quadrado da distância, o teste de Chebyshev que impede o vazamento pelas
  paredes).
- **Caminhos especulares — fótons (light tracing)**: fótons emitidos das fontes pela potência, que atravessam
  superfícies especulares e transmissivas (vidro, metal polido) até a primeira difusa, depositando a irradiância num
  hash espacial em mundo com acúmulo temporal — as cáusticas de toda superfície (US5), que as sondas não capturam.
- **Céu**: emite pelos raios das sondas que escapam (o céu com oclusão) e por fótons para as cáusticas do céu.

O usuário pediu "luz de ambiente por fóton, tipo luz do sol": a luz difusa rebatida por fótons puros exigiria milhões
por quadro e ainda ficaria ruidosa; o caminho das sondas com amostragem das fontes é o mesmo transporte físico no
sentido inverso, convergente e estável. Os fótons ficam onde só eles funcionam (luz focada por superfícies especulares).

**Alternativas**: só fótons com estimativa de densidade (ruído e custo linear na cena, vazamento nas paredes finas);
ReSTIR GI na tela (só o que a câmera vê; instável em movimento; precisa do acúmulo temporal da 014); radiance cascades
(promissor em 2D, imaturo em 3D com geometria arbitrária); voxel cone tracing (vazamento).

### R2 (adendo, 2026-10-17) — Coleta final na tela sobre as sondas do mundo

**Achado** (medido na Cornell box da US1): as sondas do mundo acertam a luz que vem de longe (teto a 3 %, paredes a
0,4–4 %), mas não a de perto. As sombras nítidas da luz rebatida perto da mancha de sol saem borradas: bloco baixo
−30 %, chão −16 %, bloco alto −11 %. O erro já aparece com um rebatimento e independe do espaçamento (0,15–0,5 m) e
dos vieses. É o limite conhecido das sondas de irradiância: a superfície a 10 cm da mancha só recebe a luz interpolada
de sondas a 25–30 cm, num ponto que vê outra parte da fonte.

**Decisão** (aprovada pelo usuário): uma **coleta final na tela** por cima das sondas do mundo, como no Lumen (Unreal)
e no GI-1.0 (AMD), mas sem pré-passe de desenho:

- **Sondas de tela**: uma a cada 8 × 8 pixels. A posição e a normal vêm de um raio da câmera pelo centro do ladrilho na
  estrutura de raios (R1), então não há G-buffer nem pré-passe.
- **Raios**: cada sonda de tela lança raios por cosseno no hemisfério da normal, girados a cada quadro. No acerto entram
  a luz direta (raio de sombra), a emissão e, a partir do segundo rebatimento, a irradiância das sondas do mundo do
  rebatimento anterior (`gi_generation_irradiance`). O número total de rebatimentos é o mesmo. Os raios que escapam
  leem o ambiente.
- **Acúmulo**: a irradiância na normal da sonda (E = π · média da radiância) acumula por média móvel. A sonda do quadro
  anterior é achada reprojetando a posição pela vista-projeção anterior (guardada na GPU) e só vale se estiver no mesmo
  plano e com a mesma normal; se não, o acúmulo recomeça.
- **Desenho**: o ponto projeta-se na tela e as sondas de tela vizinhas (2 × 2, alargando para 3 × 3) pesam pela
  distância ao plano delas e pela normal. Sem nenhuma compatível (fora da tela, borda fina, partículas, água), valem as
  sondas do mundo. A especular continua vindo das sondas do mundo.
- **Recursos**: as sondas de tela são texturas da `GlobalIllumination` com um oitavo do tamanho do canvas (capacidade
  da C2: `canvasDivisor` na forma da textura), recriadas quando ele muda. São texturas, não buffers, porque o fragmento
  do desenho está perto do limite de 10 buffers de storage do Metal. O histórico do acúmulo é privado do `ProbeFlow`.

**Alternativas**: grade de sondas mais densa (custo cúbico; mesmo a 0,15 m o bloco baixo fica a ~20 %); cache em hash no
mundo (blocos visíveis na escala da célula); pré-passe com G-buffer (todo material por função precisaria de uma
variante de pré-passe).

### R3 — Materiais nos pontos atingidos: composição das funções `material` em compute

**Decisão**: o material no ponto atingido é o mesmo da 011: um kernel de sombreamento dos acertos compõe as funções
`material` de todas as entidades da cena num único shader (como o ponto de cena `field` compõe várias funções com o
sufixo do hash, A8 — na C2, a composição genérica de funções de um ponto por entidade num kernel, escolhidas pelo slot
do registro) e escolhe pela função da instância atingida; sem função, o fechamento pronto das constantes. Do
fechamento usam-se o albedo difuso, a emissão, a transmissão e o especular (para decidir o caminho do fóton). Funções
que só valem no fragmento (derivadas de tela, ex. `geometry.tangentUv`) caem no fechamento sem as entradas de
derivada (documentado).

**Alternativas**: tabela de constantes por material (rápida, mas o grafo que varia a cor por ruído rebateria a cor
errada); textura de albedo por objeto (não existe — é a 012).

### R4 — Céu físico: atmosfera de Hillaire (2020) em compute

**Decisão**: Resource `Sky` com o modelo de atmosfera de Hillaire (espalhamento de Rayleigh e Mie, ozônio, múltiplo
espalhamento por tabela): tabelas geradas em compute (transmitância, múltiplo espalhamento, vista do céu por
latitude-longitude da direção) quando os parâmetros mudam; ligado a uma `DirectionalLight` (o sol). O sol chega à
superfície atenuado pela transmitância da atmosfera — contribuição do `Sky` ao ponto `light_transmission` (por luz, 011) para a luz do sol. O céu é desenhado como fundo (passe de tela onde a profundidade é a do plano distante) e é a
fonte dos raios que escapam (R2). Referência de CPU: a integração numérica do mesmo modelo (espalhamento simples e o
múltiplo da tabela) em direções de amostra.

**Alternativas**: Preetham/Hosek-Wilkie (ajustes analíticos baratos, sem a cor física do sol no horizonte nem o céu
noturno; não aceitam altitude); Bruneton 2008 (preciso, tabelas 4D pesadas).

### R5 — Acúmulo temporal no espaço das sondas

**Decisão**: cada quadro, os raios novos de cada sonda são misturados à sonda por média móvel exponencial (histerese
0,97 padrão), com histerese menor (resposta rápida) quando a mudança da sonda passa de um limiar (a luz acendeu, a
geometria mudou) — a resposta ≤ 0,25 s (SC-006). As cáusticas no hash espacial também. Nada depende do TAA de tela
(014).

### R6 — Colocação e estado das sondas

**Decisão**: volume de sondas em cascatas centradas na câmera (3 cascatas de 16×8×16, espaçamento dobrando) para
cobrir cenas grandes; sondas dentro da geometria (a maioria dos raios atinge faces de trás) são **desligadas**; sondas
perto de paredes são **deslocadas** (relocação DDGI) para fora; o deslocamento e o estado ficam em buffers da sonda,
atualizados em compute. Interpolação na contribuição: as 8 sondas da célula, pesos trilineares × visibilidade de
Chebyshev × voltada para a normal.

### R7 — Integração no desenho: contribuição ao `scene_lighting` e fim do hemisfério

**Decisão**: o Resource `GlobalIllumination` contribui ao ponto `scene_lighting` com a luz indireta: o fechamento recebe
a irradiância interpolada das sondas (difuso, subsuperfície, parede fina) e a radiância especular das sondas na direção
refletida alargada pela rugosidade (os mesmos albedos direcionais da 011), mais as cáusticas do hash. A função de
ambiente da 011 (`closure_ambient`) vira o caso particular da função geral `closure_indirect(c, n, v, irradiância,
radiância especular)`. Com a iluminação global na cena, os estágios padrão retiram o `HemisphereLight` (evento de
inserção) e o devolvem quando ela sai — o céu com oclusão substitui o hemisfério sem contar o ambiente duas vezes.

### R8 — Referência de traçado de caminhos na CPU

**Decisão**: traçador de caminhos em TypeScript para os smokes (cenas pequenas: Cornell box, cômodo com janela, caixa
fechada, ambiente branco), com os mesmos materiais (base da 011, difuso para a Cornell) e o mesmo número de
rebatimentos, amostragem estratificada determinística; o smoke compara a radiância média por região (máscaras por
instância) com a do alvo HDR.

### R9 — Orçamento e qualidade

**Decisão**: qualidade por Resource (`quality: 'low' | 'medium' | 'high'`, rebatimentos, raios por sonda, sondas
atualizadas por quadro, fótons por quadro); padrão `medium`: 128 raios por sonda, ¼ das sondas por quadro, 256 mil
fótons. Orçamento medido e registrado no fechamento: alvo ≤ 4 ms de GPU a 1280×720 com 1 milhão de triângulos no perfil
de referência (Apple Metal 3); a reconstrução da TLAS e os refits entram na conta.

### R10 — Dispositivo e limites

**Decisão**: a estrutura usa buffers de storage grandes (nós, primitivas, instâncias); sem os limites necessários
(tamanho de binding, buffers por estágio), a iluminação global se desliga com aviso único e o hemisfério continua.

### R11 — Fluidos por campo de distância (pedido do usuário, 2026-10-17)

**Achado (bench, fotos do usuário)**: a água do `particles/64k-water` mostra a borda recortada em semicírculos (as
esferas das partículas), uma textura em favo de mel na superfície (a reconstrução na tela das esferas mais as
ondulações) uma linha de brilho serrilhada na borda da frente e a sombra serrilhada no fundo (a cobertura da água vista pela luz, em
semicírculos) — todos da superfície reconstruída a partir das esferas das partículas (017, na tela e na vista da luz),
não do material da 011.

**Decisão**: a superfície dos fluidos de partículas passa a ser um **campo no espaço**, construído na GPU a cada quadro:

- **Grade esparsa em blocos** (bricks de 8³ voxels) alocada só onde há partículas (hash espacial dos blocos ocupados +
  compactação, as primitivas existentes), voxel de ½ espaçamento de partícula.
- **Densidade por núcleos anisotrópicos** (Yu & Turk 2013: a covariância dos vizinhos estica o núcleo ao longo da
  superfície) — superfícies planas ficam planas, bordas finas, gotas separadas não se fundem; depois **redistanciamento**
  na faixa estreita (o campo vira distância com sinal, |∇φ| ≈ 1), o que permite marchar com passos seguros.
- **Desenho por marcha de raio** contra o campo, com refinamento do cruzamento (secante) e **interpolação B-spline
  tricúbica** do campo para o ponto e a normal (contínuos até a segunda derivada): a superfície é lisa em qualquer
  resolução de tela — a tela só decide quantos raios, não a forma.
- A mesma superfície serve à câmera, à vista da luz (as cáusticas da 011 passam a refratar nela), à luz rebatida e aos
  reflexos e refrações (R1 híbrida). As partículas continuam a simulação (inalterada).

**Alternativas**: melhorar a reconstrução na tela (filtro bilateral mais largo, curvatura): ataca o sintoma, depende da
resolução e continua sem existir para os raios; marching cubes para malha (malha nova a cada quadro, facetas de
perto, custo de geração); só núcleos isotrópicos (superfícies "de bolhas", o favo de mel volta).

### R12 — Meios participantes (névoa, neblina, fumaça)

**Decisão**: Resource `FogVolume` (caixa ou esfera, densidade constante, por campo ou por função/nó de ponto; albedo de
espalhamento; anisotropia de Henyey-Greenstein; emissão opcional). Desenho por **froxels** (grade 3D alinhada à câmera,
160×90×128 com fatias exponenciais) em compute: por froxel, o espalhamento da luz direta (visibilidade pela sombra e pela
estrutura de raios), do céu e da luz rebatida das sondas; integração da frente para trás; acúmulo no espaço dos froxels
com reprojeção e jitter (sem o TAA da 014); leitura **tricúbica** na composição — sem faixas nem blocos. Os raios das
sondas e dos fótons atravessam os volumes com a transmitância (marcha no volume), então a névoa atenua a luz rebatida e
as cáusticas, e recebe a luz rebatida.

**Alternativas**: marcha de raio por pixel com ruído e filtragem (mais nítido nos feixes, mais caro, ruído sem TAA);
neblina analítica por altura (sem feixes nem densidade variável).

### R1 (adendo) — Estrutura híbrida

A TLAS também guarda **instâncias de volume** (caixas dos campos dos fluidos e dos meios): ao atingir a caixa, a consulta
marcha no campo (superfície do fluido) ou acumula a transmitância (meio). Os corpos de partículas que são fluidos com
`FluidSurfaceMaterial` entram como volume de campo; os demais (sprites) continuam como esferas.
