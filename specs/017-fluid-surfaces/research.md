# Research: Superfície de fluido — água contínua com cáusticas

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · Código de referência: `develop` em `3a808c4`

## Achados no código

| #   | Achado                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Fases fixas `physics → transform → shadow → forward → post → ui` (`scene/flows/Phase.ts`); dentro da fase, prioridade decrescente. `ShadowFlow` (shadow, 0), `ForwardFlow` (forward, 0), `ParticleFlow` (forward, −50), `DebugFlow` (forward, −100), `PostFlow` (post) — `presentation/flows/defaults.ts`     |
| A2  | `FrameTargets`: `color` (formato do canvas, resolvida, lida pelo pós), `depth` (`depth24plus`, com 4 amostras quando há MSAA) e `samples` (cor multiamostrada). Os passes da cena desenham em `samples` e resolvem em `color` (`RenderFlow.colorAttachment`)                                                  |
| A3  | Só uma luz projeta sombra no forward (`castingShadowMap(world)`); `ShadowMap` é `depth32float` com a matriz `ShadowMatrix` produzida na GPU, projeção ortográfica da luz direcional (`shadow_matrix.wgsl`: caixa ±10, 0,1–50). Spot e pontuais não têm sombra                                                 |
| A4  | O forward ilumina por `lambert_lit(albedo, n·l, shadow_factor)` (`forward.wgsl`): a luz direta é multiplicada pelo fator de sombra — o lugar natural de um fator de transmissão da luz pela água                                                                                                              |
| A5  | `ParticleFlow` desenha corpos com `PointSpriteMaterial` e avisa (uma vez) para qualquer outro material; lê a posição do pool pelo `ParticleDrawParams` (`first`, `strideVec4`, `posOffsetVec4`)                                                                                                               |
| A6  | A C2 aloca texturas de descritor (`role: 'texture' \| 'storage-texture'`, `TextureShape` com `sizeFromCanvas`), recria as de tamanho do canvas no `canvasReconfigured` e dá uso por papel: `texture` = amostra/cópia/alvo de render; `storage-texture` = storage/amostra/cópia; multiamostrada = alvo/amostra |
| A7  | `allocation: 'onDemand'` + `ResourceDirectory.ensureAllocated` (008) aloca um descritor individual quando um estágio pede; hoje devolve só o buffer                                                                                                                                                           |
| A8  | `CameraMatrices` tem `view`, `projection`, `viewProjection`, `position` — produzidos na GPU; a CPU não conhece as matrizes                                                                                                                                                                                    |
| A9  | A C1 (`Frame`) já grava `copyTextureToTexture`, passes de render com vários anexos de cor, blending e `frag_depth`, compute com storage textures e atomics; nenhuma mudança na C1 é necessária                                                                                                                |
| A10 | A profundidade da cena com MSAA só é legível por `textureLoad` de `texture_depth_multisampled_2d`; sem MSAA, `texture_depth_2d` — dois módulos (ou duas entradas) por número de amostras                                                                                                                      |

## Decisões

### R1 — Método da superfície: espaço de tela

**Decisão**: superfície em espaço de tela (van der Laan, Green e Sainz 2009; filtro de faixa estreita de Truong e
Yuksel 2018): profundidade das esferas das partículas, espessura acumulada, suavização bilateral separável, normais
reconstruídas da profundidade suavizada, composição óptica num passe de tela cheia.

**Razões**: custo proporcional aos pixels, não ao volume (64k partículas desenham ~0,5 Mi fragmentos); superfície lisa
sem a resolução de grade do marching cubes; e **o mesmo produtor serve à vista da luz** (R6), base das cáusticas — a
isosuperfície exigiria uma segunda técnica para elas. A óptica (R5) consome uma superfície genérica (profundidade,
espessura, material por pixel), o que atende o FR-031: a água por altura da 029 escreve a mesma superfície.

**Alternativa rejeitada**: isosuperfície por marching cubes sobre densidade em grade 3D (128³ = 2 Mi células; splat da
densidade + classificação + compactação + desenho indireto). Medição de ordem de grandeza (literatura e kernels
equivalentes da 005): 3–6 ms para 64k partículas na máquina de referência, contra ~2–3 ms do espaço de tela; aparência
facetada abaixo de 256³; memória de 8–64 MiB por grade. Fica registrada para quando houver necessidade de malha (colisão
ou exportação), fora desta spec.

### R2 — Profundidade da água (vista da câmera)

Passe de render: um quad por partícula (como o `ParticleFlow`, posição lida do pool pelo `ParticleDrawParams`), esfera
impostora; o fragmento escreve a **profundidade linear de vista** (`r32float`) e o slot do material (`r32uint`, +1; 0 =
sem água), com anexo de profundidade próprio `depth32float` de amostra única para ficar com a mais próxima. Fragmentos
atrás da cena opaca são descartados lendo a profundidade da cena (A10) — a água atrás de uma caixa não entra.

### R3 — Espessura

Passe de render aditivo (`r16float`, blend `one + one`), sem anexo de profundidade: cada fragmento soma a corda da
esfera (`2·sqrt(r² − d²)`) × fator do material; descarta os ocluídos pela cena como em R2. A soma de vários corpos e
materiais é a espessura total atravessada (absorção).

### R4 — Suavização

Compute separável (horizontal → vertical), N iterações (padrão 2) de filtro bilateral de faixa estreita sobre a
profundidade linear: raio em pixels = raio do material em mundo projetado pela distância (limitado a 24 px), peso de
faixa que **ignora** amostras além do limiar de descontinuidade do material (silhuetas preservadas, FR-007) e amostras
de outro material (FR-005). Ping-pong entre `depth` e `depthTemp` (`storage-texture` `r32float`). A espessura passa por
um borrão gaussiano curto (separável, mesma estrutura).

### R5 — Composição óptica

Passe de render de tela cheia (`WaterFlow`) nos alvos da cena: com MSAA desenha em `samples` (carrega) e resolve em
`color`; escreve `frag_depth` (a profundidade da água projetada) com teste `less` contra a profundidade da cena — a água
se oculta corretamente e os passes seguintes (depuração) também. Antes dele, `color` é copiada para `background`
(`copyTextureToTexture`), fonte da refração (FR-014). Por pixel:

- normal: diferenças finitas da profundidade suavizada, escolhendo o lado de menor variação (sem serrilhado na borda);
- refração: amostra `background` em `uv + n.xy · k · min(espessura, e_max)`; se a profundidade da cena nesse ponto está na
  frente da água, usa o `uv` sem deslocamento (nunca refrata o que está na frente);
- absorção: `T = exp(−absorção · espessura)` por canal; dispersão interna `(1 − T) · cor · luz`;
- Fresnel de Schlick com `F0 = ((1 − ior)/(1 + ior))²`; reflexão = cor de ambiente do material (FR-013);
- especular de Blinn-Phong/GGX com a luz que ilumina, multiplicado pela sombra da cena no ponto da superfície (FR-009);
- `cor = mix(refratada · T + dispersão, ambiente · refletividade, F) + especular`.

### R6 — Superfície na vista da luz

O mesmo produtor de R2 e R4 roda na fase `shadow` com a matriz da luz (`ShadowMatrix`, ortográfica, afim): o raio da
esfera em clip vem do comprimento das linhas da parte 3×3 da matriz (escala por eixo), sem precisar da vista e da
projeção separadas. Sem oclusão (a água é a primeira superfície vista pela luz) e sem espessura. Resolução própria
(`WaterSurface.lightSize`, padrão 1024²).

### R7 — Cáusticas por fótons em espaço da luz

Compute (`CausticsFlow`, fase `shadow`, depois do `ShadowFlow` e do produtor de R6), um fóton por texel da superfície
na vista da luz:

1. Texel com água: ponto da superfície no espaço métrico da luz (NDC dividido pela escala de cada eixo); normal pelo
   gradiente da profundidade suavizada.
2. Direção refratada de `+z` (a luz) pela normal com `1/ior`; transmissão de Fresnel `1 − F`.
3. Encontro com o receptor (o mapa de sombra: fundo e objetos submersos) por iteração de ponto fixo
   `t_{k+1} = (z_r(xy(t_k)) − z_s)/d.z`, 6 iterações (Wyman 2006/Shah et al. 2007).
4. Energia = `(1 − F) · exp(−absorção · comprimento do percurso na água)` por canal.
5. Depósito bilinear nos 4 texels vizinhos do ponto de chegada (mapa de mesma resolução da superfície), em ponto fixo
   (`atomicAdd` em três `array<atomic<u32>>`, escala 2¹²): soma inteira, independente da ordem — imagem determinística.
6. Resolução: `rgba16float` = acumulado / 2¹² com borrão 3×3 em tenda (ruído de fótons esparsos).

Com a água plana e a luz vertical, cada fóton cai no próprio texel: fator = transmissão, sem padrão (FR-019). Com
a água agitada, a convergência dá > 1 e a divergência < 1; a soma regional se conserva (menos a absorção).

### R8 — Cáusticas no forward

O forward multiplica o fator de sombra por um fator de transmissão: com `causticsEnabled = 1` e o ponto abaixo da água
na vista da luz (`z_receptor > z_água + viés`, lido de `lightDepth`), fator = mapa de cáusticas (rgb); acima da água ou
sem água, 1. Com `causticsEnabled = 0` (sem água com cáusticas na cena), o fator é exatamente 1 — imagens existentes
idênticas (FR-026, SC-008). Novos bindings no grupo 3 do forward (mapa, profundidade da água na vista da luz) com
manequins 1×1. O `WaterFlow` não reaplica o fator: o fundo refratado já vem do forward com as cáusticas.

### R9 — Resource `WaterSurface` com alocação sob demanda

Um Resource por cena (C4, inserido com `FrameTargets` pelos estágios padrão) com todas as texturas em
`allocation: 'onDemand'`: vista da câmera (`depth`, `depthTemp`, `thickness`, `thicknessTemp`, `material`,
`depthStencil`, `background`, todas `sizeFromCanvas`) e vista da luz (`lightDepth`, `lightDepthTemp`, `lightMaterial`,
`lightDepthStencil`, `caustics`, tamanho `lightSize`). O produtor chama `ensureAllocated` quando entra o primeiro corpo
com material de água; sem água, nada é alocado (FR-023). Extensão genérica da C2: `ensureAllocated` aloca também
descritores de textura e devolve a spec alocada (buffer ou textura); os estágios religam no `canvasReconfigured`.

Os acumuladores de fótons (3 × `lightSize` u32) são um descritor `storage-rw` do mesmo Resource, também sob demanda.

### R10 — `FluidSurfaceMaterial`

Material da C3 com struct próprio (pool `FluidSurfaceMaterial`): `color` (vec4), `absorption` (vec4, rgb por metro),
`ambient` (vec4, cor refletida), `ior` (1,333), `reflectivity`, `shininess`, `smoothingRadius` (escala do raio da
partícula), `depthThreshold` (descontinuidade em múltiplos do raio), `thicknessScale`, `caustics` (0/1),
`causticIntensity`, `particleRadius` (raio da esfera em mundo). `topology: 'point-list'`, `castsShadow: false` (a água
não bloqueia a luz, FR-017). O `ParticleFlow` passa a ignorar corpos com este material sem aviso (é desenhado por outro
estágio); o aviso fica para materiais que ninguém desenha.

### R11 — Estágios

| Estágio                             | Fase/prioridade | Lê                                                                        | Escreve                             |
| ----------------------------------- | --------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| `FluidSurfaceFlow({view:'light'})`  | `shadow`, −10   | pools dos corpos, `ShadowMatrix`, `FluidSurfaceMaterial`                  | `lightDepth`, `lightMaterial`       |
| `CausticsFlow`                      | `shadow`, −20   | `lightDepth`, `lightMaterial`, `ShadowMap.depth`, `ShadowMatrix`, `Light` | `caustics`                          |
| `ForwardFlow`                       | `forward`, 0    | + `caustics`, `lightDepth`                                                | cena                                |
| `FluidSurfaceFlow({view:'camera'})` | `forward`, −60  | pools dos corpos, `CameraMatrices`, `FrameTargets.depth`                  | `depth`, `thickness`, `material`    |
| `WaterFlow`                         | `forward`, −70  | `depth`, `thickness`, `material`, `background`, sombra, luz               | cena (`samples` → `color`, `depth`) |

`FluidSurfaceFlow` é o produtor de partículas (uma classe, duas vistas); `CausticsFlow` e `WaterFlow` consomem a
superfície genérica e não sabem de partículas (FR-031). O `DebugFlow` (−100) continua por último.

### R12 — Uma superfície para vários corpos e materiais

Todos os corpos com `FluidSurfaceMaterial` desenham no mesmo produtor; o slot do material por pixel separa a suavização
e escolhe a óptica. Onde água de um material está atrás de água de outro, a espessura somada tinge (a de trás não é
refratada separadamente). A spec é ajustada (FR-014 e caso de borda) para esse comportamento.

### R13 — Câmera dentro da água

Esferas que cruzam o plano próximo são cortadas pelo recorte; a espessura restante tinge. A composição limita a
profundidade e a espessura a valores finitos e usa a cor de dispersão quando a profundidade da superfície é menor que o
plano próximo — sem NaN nem preto (verificado no smoke).

### R14 — Verificação

- Testes de CPU (Vitest, `countingCore`): `FluidSurfaceMaterial` (empacotamento, padrões, validação), `WaterSurface`
  (descritores sob demanda, nada alocado sem água), `ensureAllocated` de textura, seleção de corpos pelos estágios,
  `ParticleFlow` sem aviso para o material de água, `ForwardFrameParams` com `causticsEnabled`, registro e ordem dos
  estágios.
- Smoke `fluidSurface` (navegador, fixture por caso, duas execuções idênticas no `--record`): continuidade (barragem
  SPH 36 864), PBF, MPM fluido, refração/absorção sobre fundo quadriculado em três profundidades, cáusticas (agitada,
  plana, sem água), objeto submerso, coexistência sprites + água, câmera dentro da água, `antialias: false`; contagem de
  leituras e escritas por partícula.
- Bench: cena `particles` ganha as variantes `4k-water` e `64k-water` (luz direcional com sombra; água com cáusticas).
- `trajectories` inalterada; `render` e `particles` (008) idênticos.

### R15 — Desempenho previsto (1280×720, máquina de referência)

Profundidade + espessura (64k): ~0,8 ms; suavização 2× separável: ~0,7 ms; composição: ~0,2 ms; vista da luz 1024²:
~0,6 ms; fótons + resolução: ~0,4 ms. Total ≈ 2,7 ms, contra o teto de 3 ms do SC-005. Se passar, os ajustes são a
resolução da vista da luz (512²) e uma iteração de suavização a menos — parâmetros, não mudanças de desenho.
