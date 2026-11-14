# Data Model — 037 padronização matemática e reuso

## Inventário (documento)

| Campo     | Conteúdo                                                                                  |
| --------- | ----------------------------------------------------------------------------------------- |
| família   | transformações e matrizes · espaços e reprojeção · hash e aleatórios · cor · acumuladores |
| definição | nome, arquivo:linha, conta (constantes, classe, domínio)                                  |
| usuários  | arquivos que chamam                                                                       |
| bit a bit | se uma fixture, teste exato ou consistência interna depende da sequência                  |
| destino   | canônica · unificar · unificar (muda resultado) · variante nomeada · remover              |
| estado    | pendente · feito (commit) · decisão do usuário pendente                                   |

Regra: toda entrada com destino "unificar (muda resultado)" só passa a "feito" depois da medida e da decisão do
usuário (FR-013).

## Assinatura canônica (teste)

| Campo       | Conteúdo                                                                   |
| ----------- | -------------------------------------------------------------------------- |
| padrão      | constante numérica ou forma textual que identifica a conta                 |
| módulo dono | o único arquivo onde o padrão pode aparecer                                |
| exceções    | arquivos de referência da CPU e espelhos de teste (listados, com o motivo) |

## Primitivas (módulos WGSL da C3, `elements/gpu/wgsl/math/`)

| Módulo                         | Conteúdo                                                                                                                                                              | Espelho na CPU (f64)                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `constants`                    | `PI`, `TAU`, `INV_PI`                                                                                                                                                 | —                                   |
| `random` (aleatoriedade)       | `pcg_hash`, `hash2`, `hash3`, `hash_signed`, `random_seed(fluxo, índice, quadro)`, `random_next`, `random_unit`; fluxos `RANDOM_STREAM_*` (constantes compartilhadas) | `elements/math/reference/random.ts` |
| `hash_address` (endereçamento) | `hash_cell(vec3i)` (Teschner), `hash_knuth(u32)`                                                                                                                      | idem                                |
| `color`                        | `luminance` (Rec.709 linear), `max_channel`, `ycocg`, `ycocg_inverse`, `srgb_encode`, `srgb_encode_extended`, `srgb_decode`, `grade_gamma`, `unpack_half_rgb`         | `elements/math/reference/color.ts`  |
| `basis`                        | `basis_duff(n)`, `basis_cross(n, limiar)`                                                                                                                             | idem                                |
| `sampling`                     | cosseno no hemisfério, esfera, cone, disco, triângulo                                                                                                                 | idem                                |

## Álgebra de transformações (`elements/gpu/wgsl/math/xform_*.wgsl`)

| Classe    | Representação                 | Operações                                                                                            |
| --------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| rígida    | `mat4x4f` (ou rotação + t)    | `rigid_compose`, `rigid_inverse`, `rigid_point`, `rigid_direction`                                   |
| afim      | `mat4x4f` com linha (0,0,0,1) | `affine_compose`, `affine_inverse` (guarda det), `affine_point`, `affine_direction`, `affine_normal` |
| projetiva | `mat4x4f`                     | `projective_inverse`, `projective_point` (divisão por w da política única)                           |
| TRS       | quaternion, escala, posição   | `trs_world`, `trs_normal`                                                                            |
| 3×3       | `mat3x3f`                     | `mat3_inverse`, `mat3_det`, `mat3_transpose`, `mat3_inverse_symmetric`                               |

Referência: `elements/math/reference/xform.ts` (f64), usada pelos testes de equivalência (tolerâncias em research R3).

## Referencial temporal

| Dado                     | Onde                                               | Novo                                                                                       |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `WorldTransform`         | pool (Transform.ts)                                | inalterado                                                                                 |
| `WorldInverse`           | pool novo, **sob demanda** (alocado por quem liga) | `inverse: mat4x4f` — a inversa afim do mundo, escrita pelo `TransformFlow` nos slots sujos |
| `PreviousWorldTransform` | pool (MotionHistoryFlow)                           | inalterado                                                                                 |
| `CameraMatrices`         | pool (CameraFlow)                                  | + `inverseView`, `inverseUnjitteredViewProjection`, `previousView`                         |

Removidos: as cópias próprias da câmera anterior em `gi_screen_history[0..4]` e `froxel_camera`.

## Módulo de espaços (`elements/gpu/wgsl/math/view_space.wgsl`)

`ndc_to_uv`, `uv_to_ndc`, `uv_to_pixel`, `clip_divide`, `is_orthographic`, `view_depth`, `camera_ray`,
`motion_vector`, `pixel_footprint`. Requer `cameras`; os que leem a inversa, as novas matrizes.

## Acumulador temporal

| Entidade                            | Papel                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| peças `temporal_*`                  | reprojeção por ponto, validação por guia (objeto/largura; plano/normal), pesos (contagem, mudança, histerese), momentos, corte |
| ponto `temporal_source`             | o sinal de pixel: tamanho, válido, sinal, guia, ponto anterior, largura, mudança (o atual `traced_denoise_source`, renomeado)  |
| `TracedDenoiser` → `TemporalFilter` | o Resource dos alvos do acumulador de pixel (o nome deixa de dizer "traçado": serve a qualquer sinal de pixel)                 |

Valores de domínio novos: `historyPrecision: 'half' | 'full'` no `TemporalAntialiasing`, `TemporalFilter` e `Froxels`
(o padrão é o atual até a medida e a decisão do usuário).

## Canal temporal (C2; item 5 completo no lado do recurso, R10)

| Entidade                                 | Papel                                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HistoryShape` (`GPUDescriptor.history`) | a série de um descritor de textura, buffer de storage ou pool: `depth` fatias, `precision` (`half`/`full`), `filtered`                                   |
| `TemporalChannel` (`scene/systems`)      | o anel: cabeça, `frames` (gravações seguidas), carimbos (quadro, tempo), `epoch` (fatias recriadas); gira no `frameRecording` só se gravado              |
| `ChannelInfo` (`ResourceDirectory`)      | `channelOf`, `channelOfPool`, `markWritten`, `markPoolWritten`, `invalidateChannel`, `invalidatePoolChannel`; `view(lag)`, `buffer(lag)`, `stamp`, `age` |
| `slot.channel` / `slot.poolChannel`      | o `BoundChannel` do Flow (`written()`, `invalidate()`); fornecedor `{ slot, lag }` nos recursos de shader                                                |
| fase do bind group (`PipelineState`)     | um bind group por combinação das cabeças dos canais do grupo (≤ 64), criados fora da gravação; o quadro escolhe                                          |

Instâncias: `TemporalAntialiasing.history|state|light` (pixel), `GlobalIllumination.screenHistory` (ladrilho, buffer),
`Froxels.history` (célula 3D), `TemporalFilter.accumulated|accumulatedMoments|guide` (pixel; o guia em `rgba32uint`:
bits do id), `RigidBody.energy` → pool `BodyEnergy` (entidade, 8 fatias; `EnergyMeter`, `EnergyFlow`, `BodyEnergySchema`).
`SoftBody.energy` → pool `SoftBodyEnergy` (entidade, 8 fatias; `SoftEnergyFlow`), com a faixa `SoftBody.range` → pool
`SoftBodyRange` (partículas, arestas, algoritmo e blocos, inícios por `slotRefs` `self:`; mesmo slot da série), os
blocos `SoftBody.chunks` → pool `SoftBodyChunk` (a faixa e o índice; ⌈max(n, e)/1024⌉ por corpo) e as somas
`SoftBody.partials` → pool `SoftBodyPartial` (no slot do bloco). Ponto `soft_energy_source`: a fonte de cada algoritmo
(XPBD com arestas, nós, MPM) na passada dos blocos.

## Limites

| Entidade                               | Conteúdo                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| fixture `adapter-limits-<perfil>.json` | todos os limites do adaptador, `features`, data, navegador                        |
| `ENGINE_PORTABLE_LIMITS`               | por limite que o desenho usa, o mínimo comum às fixtures dos perfis de referência |
