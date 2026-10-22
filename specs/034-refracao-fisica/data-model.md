# Data Model — 034

## EngineReadiness (C2, Resource singleton da cena)

| Campo      | Tipo                                 | Regra                                                                      |
| ---------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `state`    | `'preparing' \| 'ready'`             | `ready` ⇔ 0 compilações, verificações e trocas em voo e 0 Flows preparando |
| `pending`  | lista de `{ flow, pipeline, since }` | atualizada pelo `FlowRuntime`/`PipelineState`                              |
| `revision` | `u32`                                | sobe a cada transição                                                      |

Eventos: `enginePreparing { pending }`, `engineReady { revision }`, `consumerMissing { flow, name }` (uma vez por par),
`engineError { stage: 'pipeline', pipeline, message }`.

## Refraction (C3, Resource singleton)

| Campo           | Tipo  | Padrão | Regra                                                                         |
| --------------- | ----- | ------ | ----------------------------------------------------------------------------- |
| `maxInterfaces` | `u32` | 16     | 1–32; no limite a energia conta como absorvida (contador)                     |
| `maxMediaDepth` | `u32` | 4      | fixo no WGSL (`REFRACTION_MAX_MEDIA`); meios excedentes viram erro de autoria |
| `enabled`       | bool  | true   | desligada, transmissivos usam só a reflexão traçada e opacidade               |

Alvos (do próprio `Refraction`, do tamanho do canvas, sob demanda — o `RefractionFlow` é C3 e não importa o
`FrameTargets` da C4; o forward, C4, escreve neles): `refraction_request` (rgba32uint: distância da câmera pelo raio do
pixel, normal octaédrica 2 × 16 bits, entidade, lobos), `refraction_radiance` e `refraction_reflection` (rgba16f), fila
de pixels (`refraction_queue`, r32uint: o texel i guarda o pixel do i-ésimo pedido — textura, fora da conta dos 10
storage) com a contagem e os argumentos do despacho em `refraction_queue_count` (`SetCount`, indireto) e os contadores
de energia do quadro em `refraction_stats` (total e no limite de interfaces, 64 bits cada, ponto fixo 1/65536).

**Meio** (registro na pilha, por caminho): `entity: u32`, `ior: vec3f` (por canal pela dispersão), `sigmaA: vec3f`
(de `transmission_color`/`transmission_depth`). **Caminho**: origem, direção, `throughput: vec3f` (ou escalar por canal),
pilha (≤ 4), contador de interfaces, canal (0–2 ou todos).

## CameraMatrices (C3, pool existente — campos novos)

`previousViewProjection: mat4`, `jitter: vec2f` (em pixels, Halton 2,3 de 8), `unjitteredProjection: mat4`.
`previousViewProjection` = `viewProjection` sem jitter do quadro anterior; num corte (`Camera.cut()`), igual à atual.

## WorldTransform anterior (C3)

Pool `worldsPrevious` (mesmo layout de `WorldTransform`), escrito pelo `TransformFlow` só nos slots sujos antes da
composição. Vértices anteriores: buffer em anel de 2 para geometrias com `produced('vertices')`, trocado por quadro.

## TemporalAntialiasing (C4, Resource singleton)

| Campo       | Tipo                            | Padrão                                                           |
| ----------- | ------------------------------- | ---------------------------------------------------------------- |
| `mode`      | `'temporal' \| 'msaa' \| 'off'` | `'temporal'`                                                     |
| `sharpness` | `f32`                           | 0 (sem nitidez extra; qualquer valor > 0 é aplicado só na saída) |

Alvos: `motion` (rgba16f: rg o movimento do ponto do pixel, ba o do que está atrás dele; a água troca o rg pelo da superfície onde ela domina a cor), `light` (rg16f: a luz que
chega ao ponto sem a textura, r a direta e g a total; escrita pelo passe principal do forward), `history[2]` (rgba16f,
ping-pong), o estado por pixel (rg32f: distância e movimento) e a luz acumulada (rg16f), os dois também em ping-pong.
A máscara reativa do raio secundário (T044a) ainda falta. O histórico é descartado em corte de câmera,
redimensionamento e troca de `mode`.

## SurfaceSample (C3, campos novos)

`footprint: f32` (largura do pixel ou do cone no ponto, em metros), `duvdx: vec2f`, `duvdy: vec2f`. No raster vêm das
derivadas de tela; nos acertos, do cone.

## FluidSurfaceMaterial (C3)

`roughness` (padrão 0,02); `refraction`, `ambient`, `shininess`, `reflectivity` obsoletos (aviso único); `ior`, `abbe`
alimentam a interface da água no traçado.

## Gravação (ferramenta)

`{ scene, frames, dt = 1/60, width, height, outputs: ('h264' | 'ffv1' | 'hevc10')[], timeoutMs }` — quadros lidos da
GPU por anel de 3 buffers; bytes entregues ao runner e escritos no `stdin` do ffmpeg.
