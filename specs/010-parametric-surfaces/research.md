# Research: Superfícies paramétricas completas

Levantamento na `develop` após o PR #44 (009 mergeada, CI verde). Achados A, decisões R.

## Achados

- **A1 Avaliação da superfície**: `surface_eval_main` (`gpu/wgsl/kernels/surface_eval.wgsl`) roda uma thread por
  vértice da grade `nu × nv`, avalia `surface_fn` (pronta por `preset`: plano, esfera, toro, terreno fBm, ou a
  `SurfaceFunction`), as tangentes pelo ponto `surface_tangents` (diferenças centrais com `h_u`/`h_v`, ou
  `surface_du`/`surface_dv` quando a função define as duas), recua do polo, aplica `space_map`/`space_normal` e grava
  `[pos.xyz, normal.xyz, su, sv]` (8 `f32`, uv normalizado) no buffer de vértices. O espaço só transforma a normal
  (`combineSpace.ts`): as formas fundamentais da superfície final exigem derivadas do mapa composto.
- **A2 Quando avalia**: `SurfaceFlow` (fase `transform`, prioridade −40) avalia quando a superfície entra/muda, a cada
  quadro com `animated` ou com espaço na cena, no tempo `time.simulated` (fim do quadro). Roda **depois** da física.
- **A3 Vértice de 32 B fixo**: `VERTEX_LAYOUT` do forward e da sombra, `i*8u` no `surface_eval`, `wire.wgsl`,
  `point_sprite.wgsl`, `soft_vertex_write.wgsl` e o smoke `extensionPoints` (que confere hash dos vértices) supõem 8
  `f32` por vértice.
- **A4 SurfaceSample**: `{ world_position, normal, uv, time }` (`material_point_types.wgsl`), construído
  posicionalmente em `forward.wgsl:67` e em `material_check.wgsl:11`; as funções do usuário só leem campos.
- **A5 Colliders**: plano, caixa, esfera e malha (`physics/colliders`), cada um num pool com schema próprio;
  `ColliderSet` (não é Flow) é instanciado por solver (`lcp_`, `sph_`, `pbf_`, `mpm_colliders`) e liga contagens,
  pools, donos e corpos. `collider_set.wgsl` (grupo 2, bindings 0–9) faz laços em sequência (planos, caixas, esferas)
  limitados pelas contagens; `ColliderHit { dist, normal }` é a fronteira genérica; `push_out`, `constrain` (MPM) e
  `adhesion` (030). Não existe binding de dado extra por collider (a malha não tem triângulos na GPU e não gera
  contato — P2).
- **A6 Consumidores**: SPH (`sph_collision`), PBF (`pbf_predict` adesão, `pbf_collision`), MPM (`mpm_grid_update`,
  `mpm_particle_collision`). **XPBD, FEM, `SoftSurface` e o emissor não colidem com nada.** O PBF/SPH ainda prendem
  em `bound_min` (domínio).
- **A7 Corpos rígidos**: o LCP não usa `collider_set.wgsl`; `rb_narrowphase.wgsl` tem um pipeline por tipo
  (`plane/box/sphere/mesh`), planos exaustivos (corpos × planos), caixas/esferas por broadphase indireto; caixa gera
  um contato por canto penetrante, esfera um. Par = `rb_i * total_col_count + pool_base + col_j` (warm start por par e
  feature). Atrito do corpo; restituição `max` (0 no lado estático).
- **A8 Passo fixo**: `Time.advance` com acumulador (`fixedDt = 1/60`, `maxStepsPerFrame = 4`); cada Flow de física
  repete **os seus** `time.steps` passos dentro do próprio `dispatch` (LCP inteiro, depois SPH inteiro…). As escritas
  da CPU (`core.write`) chegam antes de qualquer passo do quadro: não há como mudar um uniforme entre passos.
- **A9 Texturas e grades**: a C1 tem texturas 3D e de armazenamento, mas ninguém as usa em compute; grades da física são
  storage buffers (`mpm_grid`). Pools aceitam `count > 1` slots contíguos por Resource (spec 008).
- **A10 Indireto**: `Drawer.indexedIndirect` existe na C1 e é reexportado; o papel de descritor `'indirect'` é alocado
  pelo `ResourceSystem`; buffers de vértice/índice/indireto têm uso `STORAGE`. Nenhum Flow desenha indireto; forward e
  sombra desenham com `firstInstance = group.first` (o indireto com `firstInstance ≠ 0` exige a feature
  `indirect-first-instance`, que o `DeviceOptions.requiredFeatures` já sabe pedir).
- **A11 Câmera em compute**: slots `camera` (singleton) + `cameras` (pool `CameraMatrices`, só GPU); o `CameraFlow`
  roda antes do `SurfaceFlow`.
- **A12 Geometria de CPU**: `ParametricGeometry.sample()` grava normal `[0,1,0]` e índices `a,c,b, b,c,d` (enrolamento
  oposto ao da `ParametricSurface`). Usuários: smoke `bigMesh` (plano em z = 0, luz `[0,-1,0]`, critério de pixels
  claros — passa hoje só por causa da normal errada), testes `contentKey` e `indexFormat`. Sem fixture de imagem.
- **A13 Água e cáusticas (017)**: receptores das cáusticas = tudo o que projeta sombra (o terreno inclusive), sem chão
  fixo em y = 0; a sombra da cena é um ortográfico fixo de ±10 m na origem (`shadow_matrix.wgsl`), então o lago tem de
  caber nessa caixa. Bloqueio atual: a água não colide com o terreno (A5).
- **A14 Fixtures**: `trajectories-*` (LCP com `ground`; XPBD e FEM **sem** colliders; MPM/SPH/PBF com `tank`),
  `contacts-*`, `fluidBehavior-*`, `particles-*`, `softSurface-*` (sem colliders), `extensionPoints-*` (hash de
  vértices de superfícies). O bit a bit da 030 veio de `if` à parte com o termo novo e laços com contagem zero.

## Decisões

### R1 Colisor = Resource da superfície com campo num pool (C3)

`SurfaceCollider` (C3, `physics/colliders`), anexado à entidade da `ParametricSurface`:

```ts
new SurfaceCollider({ mode: 'height' | 'distance', resolution?, margin?, band? })
```

Declara dois descritores de pool:

- `collider` → `SurfaceColliderSchema` (registro): modo, dimensões da grade, `first` do campo, número de cópias,
  passo entre cópias, folga, slot do `Transform`.
- `field` → `SurfaceColliderCellSchema` (`value: f32`) com `count = cópias × (cabeçalho + células)` — slots contíguos
  (spec 008). Mudar resolução ou modo realoca (evento de pool já existente).

O cabeçalho (escrito pela GPU, ver R2) guarda a caixa local (mín./máx. e tamanho da célula), a inversa da matriz de
mundo e a matriz normal. A consulta não precisa do pool de transformações.

- **Alternativas rejeitadas**: (a) textura 3D por colisor — não dá para ligar um número variável de texturas num
  laço; (b) buffer privado de um Flow consumido pelos solvers — viola "dado de GPU é de Resource"; (c) usar a malha
  desenhada (`MeshCollider` com triângulos) — consulta O(triângulos) por partícula e a malha adaptativa muda de forma.

### R2 Construção na GPU, por passo (C3)

`SurfaceColliderFlow` (fase `physics`, prioridade 20 — antes do LCP, 10): para cada `SurfaceCollider`, um kernel
composto com os **mesmos** pontos da superfície (`bindPoints` com `surfacePoint` e o espaço da cena, como o
`SurfaceFlow`) avalia a superfície numa grade própria `(u, v)` e constrói o campo:

- **Altura (`height`)**: (1) avalia os pontos em espaço local e acumula a caixa por `atomicMin/Max` de `f32` em ordem
  de `u32`; (2) rasteriza cada triângulo nas células xz que ele cobre com `atomicMax` da altura (ordem total: o
  resultado não depende da ordem das threads); (3) decodifica; célula não coberta = `NO_HEIGHT` (fora do terreno).
  Dobras ficam com a altura máxima (borda documentada).
- **Distância (`distance`)**: (1) pontos e caixa (com `band` células de folga); (2) semeadura: cada triângulo grava a
  distância exata às células da sua caixa expandida em 1 célula (`atomicMin` dos bits da distância) e, numa segunda
  passada, o menor id entre os triângulos que empatam no mínimo (`atomicMin` do id) — determinístico; (3) propagação
  por _jump flooding_ 3D (⌈log₂ N⌉ passadas em ping-pong, 26 vizinhos, desempate pelo menor id); (4) distância final
  exata ao triângulo mais próximo, sinal pela normal da face (dentro = lado oposto ao da normal).

**Por passo**: como cada Flow de física repete os seus passos sozinho (A8), o campo tem uma **cópia por passo** do
quadro quando a superfície anima (`animated`, espaço da cena ou `TransformFunction`): o `SurfaceColliderFlow` constrói
as `time.steps` cópias, cada uma no tempo em que o passo k termina (`Time.stepTime`); sem animação há uma cópia,
construída só quando a superfície muda (evento). Os solvers escolhem a cópia por um cursor na GPU (R3). Mesmo tempo
por passo ⇒ mesma trajetória a 30/60/144 Hz (FR-015).

A matriz de mundo vem do pool de transformações do quadro anterior (o `TransformFlow` roda depois da física); colisor
com `Transform` animado acompanha com um quadro de atraso — documentado. Escala não uniforme: distância aproximada
pela escala mínima (documentado).

- **Alternativas rejeitadas**: (a) ler os vértices do `SurfaceFlow` — avaliados no fim do quadro, depois da física, e
  só uma vez por quadro (quebra 30/60/144 Hz); (b) mover o `SurfaceFlow` para a fase de física — o desenho é por
  quadro e a resolução do colisor é outra; (c) distância por força bruta célula × triângulo — 64³ × 8 k = 2·10⁹ por
  passo.

### R3 Fronteira genérica: novo tipo `surface` (C3)

- `collider_set.wgsl` ganha os bindings 10 (`collider_surfaces`), 11 (`collider_surface_field`) e 12
  (`collider_step`), `surface_count` no `ColliderSetCountsSchema` (acréscimo) e um quarto laço, **depois** das esferas,
  em `push_out`, `constrain` e `adhesion`. Sem superfícies o laço tem zero iterações e as contas existentes não mudam
  (FR-006).
- `fn collider_hit_surface(i: u32, p: vec3f) -> ColliderHit` vive num módulo próprio (`surfaceColliderHit`), exigido
  por `colliderSet` e pelo narrowphase do LCP (os bindings são declarados por quem hospeda). Altura: bilinear, normal
  por diferenças da grade, `dist = (p.y − h)·n.y` (local → mundo); fora da caixa xz não colide. Distância: trilinear,
  normal pelo gradiente da grade; fora da caixa, distância à caixa (sem contato).
- **Cursor de passo**: `collider_step` (`u32`, do `ColliderSet` de cada solver) é zerado na transição `framePrepare` e
  incrementado por um kernel de uma thread no fim de cada passo do solver — só despachado com superfícies na cena. A
  cópia lida é `min(collider_step, cópias − 1)`.
- `ColliderSet` ganha o pool `SurfaceColliderSchema` e o de campo em `COLLIDER_POOLS`/`sources()`; vazio = buffer
  substituto, como os outros.

### R4 Corpos rígidos (C3)

Pipeline `rb_narrowphase_surface_main` no LCP, despachado só com `surface_count > 0` (corpos × superfícies, como os
planos). Esfera: um contato no centro (`dist − raio`, `sphere_radius_offset`); caixa: um por canto penetrante
(`feature = k`), peso `1/n`, como corpo × plano. A faixa `pool_base` das superfícies vai **depois** das existentes em
`total_col_count`: ids de par e warm start dos tipos atuais não mudam. Atrito e restituição pelo corpo (como hoje).
Unilateral: a superfície não recebe impulso.

### R5 Solvers que hoje não colidem (C3)

XPBD, FEM e o emissor passam a usar o `ColliderSet` (todos os tipos): kernels `xpbd_collide`, `fem_collide` e a
variante do `emit_update` com `collider_set_push_out`, despachados/compostos **só com colliders na cena**. Nenhuma cena
das fixtures combina esses solvers com colliders (A14) — fixtures intactas; se a verificação achar alguma, é listada.
`SoftSurface` herda (escreve vértices a partir dos nós do XPBD/FEM).

### R6 Geometria diferencial (C3)

Módulo `surface_sample` (refatoração do corpo do `surface_eval`): dado `(u, v, t)`, devolve posição, normal e, quando
pedido, as formas. Usado pela avaliação uniforme, pela malha adaptativa (R8) e — só a posição — pelo colisor (R2): um
único código de avaliação.

- Primeiras derivadas: as do ponto `surface_tangents` (analíticas ou numéricas). Segundas: pontos opcionais novos
  `surface_duu`, `surface_duv`, `surface_dvv` na `SurfaceFunction`; sem eles, diferenças centrais (4 avaliações
  diagonais a mais). Com espaço na cena, tudo por diferenças do mapa composto `space_map ∘ surface_fn` (as formas são
  da superfície que se vê).
- `E = Su·Su, F = Su·Sv, G = Sv·Sv`; `L, M, N` = segundas derivadas · n; `K = (LN − M²)/(EG − F²)`,
  `H = (EN − 2FM + GL) / (2(EG − F²))`, `k₁,₂ = H ± √max(H² − K, 0)`, direção principal pelo autovetor do operador de
  forma levada ao espaço (`Su·a + Sv·b`). Não finito ⇒ valor do vizinho já calculado no ponto de recuo do polo, senão
  0 (FR-009).
- Armazenamento: pool `SurfaceDiffSchema` (64 B: `metric` vec4 E,F,G,–; `second` vec4 L,M,N,–; `curvature` vec4
  K,H,k₁,k₂; `principal` vec4 direção, válido) com `count = nu × nv` slots contíguos, descrito pela `ParametricSurface`
  só com `differential: true` (ligado automaticamente pela malha adaptativa). O vértice de 32 B **não muda** (A3):
  hashes e layouts intactos.
- **Material**: `SurfaceSample` ganha `metric: vec3f`, `curvature: vec4f`, `principal: vec3f` (acréscimos no fim).
  O forward tem a variante `forward_diff` (grupo cuja geometria descreve o pool diferencial) cujo `vs_main` lê
  `surface_diff[diff_first + vertex_index]` e interpola; a variante comum preenche zeros. O `RenderableSchema` ganha
  `diff_first` (acréscimo, `0xffffffff` sem dado). `material_check` passa os campos novos zerados.

### R7 Prontas analíticas

Esfera, toro e plano ganham derivadas analíticas (primeiras e segundas) nas prontas, para o SC-004 medir as duas
vias: com a função do usuário sem derivadas (numéricas) e com as prontas (analíticas).

### R8 Malha adaptativa (C3 + C4)

`ParametricSurface({ adaptive: { patches: [P, Q], maxLevel, budget, curvature, distance } })`. Modo uniforme continua o
padrão.

1. **Nível por retalho** (`surface_adapt_level`): para cada retalho da grade P × Q, avalia curvatura e métrica no
   centro e nos cantos e a distância à câmera ativa (pool `CameraMatrices`, posição); nível `L ∈ [0, maxLevel]` pelo
   maior de: erro de corda estimado `|k|·(tamanho)²/8 > tolerância` e tamanho projetado em pixels > alvo.
2. **Orçamento**: histograma de níveis + kernel de uma thread que acha o viés global para o total (cota superior por
   retalho) caber em `budget` triângulos; níveis menos viés.
3. **Arestas sem frestas**: cada aresta usa `e = min(L, L do vizinho)`. Vértices de borda acima do nível da aresta são
   **colapsados** sobre o vértice par do vizinho (mesmo `(u, v)` ⇒ mesma conta ⇒ mesma posição bit a bit);
   triângulos degenerados são inofensivos. Sem T-junction, sem fresta por construção (FR-012).
4. **Soma de prefixos** (um grupo de trabalho; até 4096 retalhos) de vértices e índices; **geração** (`surface_adapt_emit`)
   com o `surface_sample` (posição, normal, uv, diferencial) e índices; contagens no registro de desenho.
5. Buffers com capacidade do orçamento, descritos pela superfície (`vertices`, `indices`, `diff`, `indirect`),
   sem leitura de volta.

Refeita (FR-013) quando a superfície muda/anima ou quando a câmera (`Transform` e parâmetros, na CPU) se move mais que
uma fração do tamanho do retalho mais fino, ou muda o FOV/aspecto.

**Desenho indireto (C4)**: `ForwardFlow` e `ShadowFlow` ganham o ramo `indexedIndirect` para geometria com descritor
`'indirect'`. Como o `firstInstance` do grupo é do passe e o indireto com `firstInstance ≠ 0` exige
`indirect-first-instance`: (a) a C4 pede a feature quando o adaptador a tem (`DeviceOptions`); (b) cada passe tem o
seu registro de argumentos por grupo indireto, preenchido por um kernel de uma thread (contagem da geometria + `first`
do grupo do passe). Sem a feature, a superfície adaptativa desenha a grade uniforme de mesma precisão máxima e emite
`adaptiveUnavailable` (uma vez). Wireframe adaptativo: arestas geradas no mesmo kernel com o seu registro indireto.

- **Alternativas rejeitadas**: (a) T-junctions com vértices projetados na aresta grossa — frestas de arredondamento;
  (b) tessellation de hardware — não existe em WebGPU; (c) contagem lida de volta na CPU — proibido (FR-016).

### R9 Geometria de CPU (C3)

`ParametricGeometry.sample()` calcula a normal por diferenças centrais da própria função em `(u, v)` (`h = 1e-4`,
recuo nas bordas e nos polos como no kernel), orientada para o lado da frente do enrolamento atual (`a,c,b`). O smoke
`bigMesh` muda a luz para iluminar o plano de frente (critério igual); testes de `contentKey`/`indexFormat` sem
mudança de índice. A recomendada passa a ser a `ParametricSurface` (JSDoc e guia).

### R10 Água no terreno (US1-4)

Cena `terrain-water`: terreno colidível (altura) dentro da caixa de sombra (±10 m), água PBF com
`FluidSurfaceMaterial` (refração, absorção, cáusticas), domínio do solver abaixo do terreno (o `bound_min` não pode
ser o fundo do lago). As cáusticas caem no terreno porque ele projeta sombra (A13). Medidas: partículas abaixo do
campo de altura (amostrado na CPU a partir da mesma fórmula da pronta), nível do lago (média das 10 % mais altas
dentro do vale) no último segundo, partículas fora por baixo; imagem com fixture.

### R11 Verificação

- Smoke `parametricSurfaces` (novo), casos: `terrain-bodies` (SC-001), `terrain-fluids` SPH/PBF/MPM (SC-002),
  `terrain-water` (SC-002a, imagem), `terrain-animated` 30/60/144 Hz (SC-008), `torus-bodies`, `sphere-fluid`,
  `adhesion` (SC-003), `curvature` esfera/toro analítica e numérica (SC-004, leitura só no smoke), `curvature-material`
  (imagem), `adaptive` (contagem perto/longe, total ≤ 50 % da uniforme, fresta: esfera fechada adaptativa sem pixel do
  fundo dentro da silhueta da uniforme — SC-005), `cpu-normals` (SC-006), `xpbd-fem-emitter` (colisão dos solvers
  novos). Fonte e `--dist`.
- Todos os smokes existentes sem regravar, exceto o que for listado (esperado: nenhum; o `bigMesh` muda de cena, não
  de fixture).
- Bench: variantes `particles/64k-terrain` (PBF sobre terreno colidível) e `instances/surface-adaptive`; baseline
  regravado com a máquina livre.
- Vídeos: terreno com corpos e a água formando lago (cáusticas); superfície deformando com malha adaptativa (wireframe);
  material por curvatura.
