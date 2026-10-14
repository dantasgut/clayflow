# Data Model: Superfície de fluido — água contínua com cáusticas

## `FluidSurfaceMaterial` (C3, `elements/material/`)

Material de um corpo de partículas desenhado como água. Struct próprio, pool `FluidSurfaceMaterial` (um slot por
material; o slot vai por pixel na textura `material` da superfície).

| Campo              | Tipo    | Padrão                  | Significado                                                              |
| ------------------ | ------- | ----------------------- | ------------------------------------------------------------------------ |
| `color`            | `vec4f` | `[0.1, 0.45, 0.6, 1]`   | Cor da dispersão interna (o que a água "devolve" da luz)                 |
| `absorption`       | `vec4f` | `[0.45, 0.09, 0.06, 0]` | Coeficientes de absorção por metro (rgb); `w` sem uso                    |
| `ambient`          | `vec4f` | `[0.62, 0.72, 0.85, 1]` | Cor refletida (ambiente/céu até a F4)                                    |
| `ior`              | `f32`   | `1.333`                 | Índice de refração (Fresnel, refração da tela e das cáusticas)           |
| `reflectivity`     | `f32`   | `1`                     | Escala da parcela refletida                                              |
| `shininess`        | `f32`   | `256`                   | Expoente do especular                                                    |
| `particleRadius`   | `f32`   | `0` (= automático)      | Raio da esfera em mundo; 0 usa o espaçamento do `ParticleMaterial` × 0,6 |
| `smoothingRadius`  | `f32`   | `2`                     | Raio da suavização em múltiplos do raio da partícula                     |
| `depthThreshold`   | `f32`   | `2`                     | Descontinuidade de silhueta em múltiplos do raio (não mistura além dela) |
| `thicknessScale`   | `f32`   | `1`                     | Escala da espessura acumulada                                            |
| `refraction`       | `f32`   | `0.05`                  | Deslocamento da refração na tela por unidade de inclinação               |
| `caustics`         | `u32`   | `1`                     | Liga as cáusticas deste material                                         |
| `causticIntensity` | `f32`   | `1`                     | Escala do padrão (1 = físico; 0 = só atenuação)                          |
| `rippleStrength`   | `f32`   | `0.3`                   | Inclinação das ondulações capilares procedurais (0 desliga)              |
| `rippleSize`       | `f32`   | `0.06`                  | Comprimento da maior ondulação (m); as demais até ~1/3 dele              |
| `rippleSpeed`      | `f32`   | `1`                     | Escala da velocidade (1 = dispersão de águas profundas)                  |

`topology: 'point-list'`, `castsShadow: false`. Validação na construção: `ior ≥ 1`, absorção ≥ 0, raios > 0 quando
dados, cores finitas. Mutação de `data` reenvia o slot (mesma regra dos materiais).

## `WaterSurface` (C4, `presentation/app/`)

Um por cena, inserido pelos estágios padrão junto com `FrameTargets`. Todos os descritores `allocation: 'onDemand'` —
alocados pelo primeiro produtor que tem água; sem água, nenhuma memória.

| Descritor           | Papel             | Formato        | Tamanho     | Uso                                                               |
| ------------------- | ----------------- | -------------- | ----------- | ----------------------------------------------------------------- |
| `depth`             | `storage-texture` | `r32float`     | canvas      | Profundidade linear de vista (suavizada, saída final do produtor) |
| `depthRaw`          | `texture`         | `r32float`     | canvas      | Profundidade das esferas (alvo de render); entrada da suavização  |
| `depthTemp`         | `storage-texture` | `r32float`     | canvas      | Ping-pong da suavização                                           |
| `thicknessRaw`      | `texture`         | `r16float`     | canvas      | Espessura acumulada (alvo aditivo; `r16float` é misturável)       |
| `thicknessTemp`     | `storage-texture` | `r32float`     | canvas      | Passo horizontal do borrão da espessura                           |
| `thickness`         | `storage-texture` | `r32float`     | canvas      | Espessura suavizada, lida pela composição                         |
| `material`          | `texture`         | `r32uint`      | canvas      | Slot do material + 1 por pixel (0 = sem água)                     |
| `depthStencil`      | `texture`         | `depth32float` | canvas      | Profundidade do passe das esferas (mais próxima vence)            |
| `background`        | `texture`         | canvas         | canvas      | Cópia da cor da cena antes da água (fonte da refração)            |
| `lightDepth`        | `storage-texture` | `r32float`     | `lightSize` | Profundidade da água na vista da luz (suavizada)                  |
| `lightDepthRaw`     | `texture`         | `r32float`     | `lightSize` | Esferas na vista da luz                                           |
| `lightDepthTemp`    | `storage-texture` | `r32float`     | `lightSize` | Ping-pong                                                         |
| `lightMaterial`     | `texture`         | `r32uint`      | `lightSize` | Material por texel na vista da luz                                |
| `lightDepthStencil` | `texture`         | `depth32float` | `lightSize` | Profundidade do passe da luz                                      |
| `caustics`          | `storage-texture` | `rgba16float`  | `lightSize` | Fator de transmissão da luz (rgb) consumido pelo forward          |
| `photons`           | `storage-rw`      | `u32` × 3·N    | `lightSize` | Acumuladores de fótons em ponto fixo                              |

Opções: `lightSize` (padrão `1024`).

## Superfície de água (contrato genérico, FR-031)

O que a óptica e as cáusticas consomem, independente da origem: por pixel da vista, profundidade linear suavizada
(`depth`/`lightDepth`, `+∞` = sem água), espessura (`thickness`, só na vista da câmera) e slot do material + 1
(`material`/`lightMaterial`). Produtor desta spec: `FluidSurfaceFlow` (partículas). Produtor futuro: água por altura
(029).

## Parâmetros de estágio (uniforms privados)

- `WaterViewParams` (produtor): slot da câmera (ou do mapa de sombra), vista (`0` câmera, `1` luz), tamanho do alvo,
  número de amostras da cena, iteração/direção da suavização.
- `CausticParams`: slot do mapa de sombra e da luz, tamanho do mapa, escala do ponto fixo.
- `ForwardFrameParams` ganha `causticsEnabled` (`f32`): 0 = fator 1 exato (sem água com cáusticas).
- `WaterCompositeParams`: slots da câmera, da luz e do mapa de sombra, sombra ligada, tamanho do alvo.

## Estados e eventos

- Corpo com `FluidSurfaceMaterial` entra (`entitiesChanged`) → produtor aloca a superfície (`ensureAllocated`), prepara
  o pipeline do pool, grava a região de desenho; consumidores passam a rodar.
- Último corpo sai → produtores e consumidores param de gravar (as texturas ficam alocadas até o fim da cena).
- `canvasReconfigured` → a C2 recria as texturas `sizeFromCanvas`; os estágios religam as views.
- `poolReallocated` → religam os pools (como o `ParticleFlow`).
- Troca do material de um corpo → saída de um conjunto e entrada no outro (sprites ↔ água) no mesmo quadro.
