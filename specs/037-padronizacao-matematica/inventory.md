# Inventário da matemática repetida (spec 037, US1)

Levantamento de 2026-10-23 sobre o estado `d38416d6` (277 arquivos `.wgsl` de `src/**` e as contas espelhadas na CPU).
Caminhos relativos a `src/`; `W/` = `elements/gpu/wgsl/`, `P/` = `presentation/`. Destinos: **canônica** (vira a
definição única), **unificar** (passa a chamar a canônica, sem mudar bits), **unificar (muda resultado)** (medida e
decisão do usuário antes — FR-013), **variante nomeada** (diferença intencional, fica com nome próprio na família),
**remover** (sem usuário).

## Estado e regra de atualização (T005)

Cada tarefa que mexe numa entrada atualiza a tabela abaixo (por família, com a tarefa e o commit). Estados:
**pendente**, **feito**, **decisão do usuário pendente** (as trocas que mudam resultado, reunidas na T048).
A lista de pendências do teste de assinaturas canônicas (T004) é a mesma desta tabela: um padrão só sai dela quando a
família está feita.

| Família            | Padrões do teste (T004)                                 | Tarefas                | Estado                                                                                                                   |
| ------------------ | ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Constantes         | π e 2π literais                                         | T008                   | feito (T008); restam os WGSL de extensão escritos nos smokes (`lighting`, `extensionScenes`) e o `PI` do `shaderLibrary` |
| Aleatoriedade      | PCG (`747796405`)                                       | T009, T014, T016       | feito (T009, T014, T016)                                                                                                 |
| Endereçamento      | Teschner (`73856093`), Knuth (`2654435761`)             | T010                   | feito (T010)                                                                                                             |
| Cor                | Rec.709 (`0.2126`), BT.601 (`0.299`), curva sRGB        | T011, T013, T015       | feito (T011, T013, T015)                                                                                                 |
| Bases e amostragem | base de Duff                                            | T012                   | feito (T012)                                                                                                             |
| Transformações     | `transpose(mat3x3f(` fora da álgebra; inversas próprias | T018–T022, T029        | feito (T017–T022, T029); tolerâncias afim/projetiva em κ·u ≈ 6e-5 (T048)                                                 |
| Espaços            | NDC → uv, uv → NDC                                      | T026–T028              | feito (T026–T028)                                                                                                        |
| Referencial        | cópias próprias da câmera anterior                      | T024, T025, T030, T031 | feito (T024, T025, T030, T031)                                                                                           |
| Acumuladores       | —                                                       | T033–T039              | feito (T033–T039): 4 de 4 nas peças; DDGI, fótons e cáusticas justificados; `TemporalFilter`                             |
| Precisão           | —                                                       | T040–T042              | feito (T040–T042): `historyPrecision` nos três donos; tabela em research R6; o antisserrilhado em `full` por padrão      |

### Registro da execução (US2)

- **T008**: `math/constants.wgsl` (`PI`, `TAU`, `INV_PI`); `GI_PI`, `SKY_PI`, `BSDF_PI`, `FROXEL_PI` e os literais
  (SPH, emissor, partículas difusas, refração, ondulação da água) passam a elas, com os mesmos f32.
- **T009**: `math/random.wgsl` (`pcg_step`, `pcg_output`, `pcg_hash`, `hash2`, `hash3`, `hash_signed`, `random_unit`,
  `random_next`); `noise` passa a requerer `random`. `diffuse_hash`, `ray_direct_hash`, `gi_hash` e os inline de
  `froxel_rotation` (que avança o estado: `pcg_step` + `pcg_output`) e `diffuse_dither` saem; `set_hash_unit` vira
  `random_unit`; `emit_rand` chama `random_unit`. `refraction_random` = `random_unit(random_next(·))` (bits iguais);
  `gi_photon_random` mantém a conversão dos 24 bits baixos que usa hoje (troca para a T014).
- **T010**: `math/hash_address.wgsl` (`hash_cell(vec3u)` — coordenadas com sinal entram por `bitcast<vec3u>`, o mesmo
  dos `bitcast<u32>` por componente —, `hash_knuth`); a redução fica com quem chama.
- **T011**: `math/color.wgsl` (`luminance` Rec.709, `luminance_bt601` provisória, `max_channel`, `ycocg`,
  `ycocg_inverse`, `srgb_curve`/`srgb_encode`/`srgb_encode_extended`/`srgb_decode`, `grade_gamma`,
  `unpack_half_rgb`); `present` requer `color`. O nó `color.luminance` mantém `node_color_luminance` (o nó exige a
  função no próprio módulo) chamando `luminance`. A luma do forward (`dot` com (¼, ½, ¼)) passa a `ycocg(·).x`: a
  mesma conta, possivelmente outra ordem de soma na GPU — conferida no smoke `antialiasing`.
- **T012**: `math/basis.wgsl` (`basis_duff`, `basis_cross(n, eixo auxiliar)` — o eixo e o limiar ficam com cada uso; a
  base das partículas difusas usa `−a` porque `d × a = (−a) × d` exatamente com `a` num eixo) e `math/sampling.wgsl`
  (`sample_cosine`, `sample_sphere`, `sample_cone`, `sample_triangle`). Fica fora o disco das partículas difusas: a
  direção radial é reaproveitada na velocidade (a conta não é a de uma amostra de disco).
- **T013**: `halton` único (`TemporalAntialiasing`); nos smokes, `support/images.ts` com `lumaSrgb` (valores sRGB de 8
  bits) e `luminanceLinear` (HDR) sobre a referência, e `support/random.ts` com `mulberry32` e `lcg` (a sequência de
  `particleScenes` preservada). A Halton escrita à mão do smoke `antialiasing` fica: é a referência independente.

### Registro da execução (US3, US4)

- **T017–T019**: `math/xform_rigid.wgsl`, `xform_affine.wgsl` (com a guarda `AFFINE_SINGULAR_DET`),
  `xform_projective.wgsl`, `xform_trs.wgsl`; `rigid_mat4_inverse`, `quat_to_mat4`, `mat4_upper3x3_transform` saíram de
  `mat.wgsl`; `ray_inverse_affine` e `node_space_inverse` passam a `affine_inverse`; o colisor usa `affine_inverse`
  depois da guarda (os mesmos bits, inclusive o −0 da translação na identidade); `transform_local` (público para as
  funções do usuário) chama `trs_world`/`trs_normal`. Equivalência na GPU (smoke `shaderLibrary`, (b′)): rígida 1,34
  ulp, TRS 2,64 ulp (≤ 4); afim 4,6e-5 e projetiva 1,6e-5 relativos (> 1e-5: critério para a T048).
- **T020**: a classe nos nós de espaço é o nó (`space.inverse` afim, `space.inverseRigid`, `space.inverseProjective`),
  escolhida na montagem do grafo. O `combineSpace` compõe funções não lineares pela Jacobiana: não tem classe.
- **T021**: `camera_projection` e `camera_shift` (o deslocamento por coluna; mesmos números no `antialiasing`).
  `water_light_fit_box` fica: outra convenção de z, e passá-la pela caixa ortográfica muda o arredondamento.
- **T022**: patch no pacote da T048 (sem efeito nas cenas atuais).
- **T024**: pool `WorldInverse` sob demanda (extensão da C2: `allocation: 'onDemand'` em pool, `ensurePoolAllocated`,
  `PoolInfo.allocated`); o `TransformFlow` despacha `transform_inverse` só com o pool pedido. Pedem: `RaySceneFlow` (as
  inversas das instâncias) e `RefractionFlow` (o ponto anterior do histórico).
- **T025**: `CameraMatrices.inverseView`, `inverseUnjitteredViewProjection`, `previousView` (conferidas no caso
  `matrices` do `antialiasing`).
- **T026–T028**: `view_space` (puro) e `camera_space` (`camera_ray`, `camera_ray_ndc`, `motion_vector`,
  `pixel_footprint`); `ray_camera`, `taa_view_depth`, `water_linear_depth`, `water_ndc_depth`,
  `water_pixels_per_meter` (sem usuário) e a `froxel_projection` própria saíram; os testes de ortográfica passam a
  `is_orthographic`. Os seis shaders de movimento continuam com os clips do vértice (`motion_from_clips`): mudar para o
  ponto de mundo no fragmento muda a interpolação e custa um produto por fragmento. `surface_adapt` mede a fração de
  tela de um tamanho, não a largura de um pixel: fica.
- **T029**: sprites, fundo, água e névoa leem `inverseView`; o `ray_scene` usa `affine_normal_of_inverse`; o campo usa
  `mat3_adjugate`. O antisserrilhado usa a inversa canônica por pixel: ler a guardada muda o arredondamento (patch na
  T048).
- **T030/T031**: a névoa lê a câmera anterior guardada (a cópia própria saiu); a luz global e o corte nos históricos
  são patches na T048.

### Registro da execução (US5)

- **T033**: `temporal/temporal.wgsl` (módulo `temporal`): `temporal_reproject_point`, `temporal_cut`,
  `temporal_validate_object`, `temporal_validate_plane`, `temporal_weight_count`, `temporal_weight_change`,
  `temporal_hysteresis`, `temporal_moments`, `temporal_variance`, `temporal_mean_variance`; referência f64 e testes em
  `elements/math/reference/temporal.ts`.
- **T035–T037 e o filtro** (as peças preservam os bits — smokes iguais à base): o filtro do sinal traçado usa a
  validação por objeto, os pesos por contagem e por mudança, os momentos e as variâncias; o antisserrilhado usa o peso
  por contagem e o corte (o fundo reprojeta sem os testes de tela, que ficam com ele, e mantém a conta própria); as
  sondas de tela usam a reprojeção e a validação por plano; a névoa usa a histerese. **4 de 4** (SC-006 pede 3).
- **T038**: DDGI (`gi_probe_blend`), fótons (`gi_photon_resolve`) e cáusticas (`caustics`) ficam com a mistura própria:
  domínio fixo (sondas, células do hash, texels da luz), sem reprojeção nem validação; a política do DDGI é a resposta
  adaptativa já compartilhada (`gi_response`), a das cáusticas é a histerese cortada pela mudança da superfície da água.
  Trocar o `mix` direto por `temporal_hysteresis` (vec4) só mudaria o nome.
- **T039**: `antialiasing`, `giNoise`, `globalIllumination`, `fog`, `refraction` iguais à base; custo: antisserrilhado
  2,40–2,43 ms (base 2,46–2,60), névoa 0,70 ms (base 0,71).
- **T034**: `TracedDenoiser` → `TemporalFilter` (`elements/lighting/temporal/`, `wgsl/temporal/temporal_filter_*`, ponto
  `temporal_filter_source`, `defaults.temporalFilter`).

## 1. Transformações e matrizes

### Inversas

| Definição                                                | Onde                                                                                                                     | Classe                                       | Usuários                                                   | Destino                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `rigid_mat4_inverse`                                     | W/math/mat.wgsl:51                                                                                                       | rígida (Rᵀ, −Rᵀt)                            | `camera_view`                                              | canônica da classe rígida                                                                 |
| `transpose(view3×3)` (≥ 8 cópias)                        | ray_camera:20, forward_background:33, media_common:40, water_composite:52, water_field:36, point/particle/diffuse_sprite | rígida (só a rotação)                        | raios de câmera, froxels, água, sprites                    | unificar (lê a inversa da vista guardada; a vista de uma `CameraFunction` não é rígida)   |
| `ray_inverse_affine`                                     | W/raytrace/ray_common.wgsl:108                                                                                           | afim (produtos vetoriais), sem guarda de det | ray_instances:74 (`toObject`)                              | unificar                                                                                  |
| `node_space_inverse`                                     | W/nodes/space.wgsl:21                                                                                                    | afim (adjunta)                               | nó `space.inverse`                                         | canônica da classe afim (com a guarda de det de surface_collider_build)                   |
| inversa afim inline                                      | W/kernels/surface_collider_build.wgsl:117                                                                                | afim, det ≤ 1e-20 → identidade               | bake do colisor                                            | unificar                                                                                  |
| `transpose(normal)` como inversa                         | W/refraction/refraction_history.wgsl:19                                                                                  | afim (truque)                                | refração (ponto anterior)                                  | unificar (lê a inversa de mundo guardada)                                                 |
| `taa_inverse`                                            | P/flows/effects/temporal_resolve.wgsl:58                                                                                 | projetiva, por pixel                         | resolução temporal                                         | canônica da classe projetiva; a inversa da vista-projeção passa a ser guardada por quadro |
| `mat3_inverse` / `mat3_det`                              | W/math/linalg.wgsl:23 / :14                                                                                              | 3×3 geral                                    | transform_compose_fn, nós, colisor, MPM, FEM, combineSpace | canônica 3×3                                                                              |
| inversa 3×3 simétrica inline                             | W/fields/field_density.wgsl:30                                                                                           | 3×3 simétrica                                | campo                                                      | variante nomeada (simétrica)                                                              |
| `invertAffine` / `spaceInverseAffine` / `inverse3` (CPU) | elements/raytrace/reference/bvh.ts:375; elements/nodes/reference/space.ts:49, :19                                        | afim / 3×3, f64                              | referências                                                | unificar numa referência f64 única                                                        |

### Matriz normal, composição e aplicação

| Definição                                                             | Onde                                                                                               | Destino                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| normal TRS `R·S⁻¹` (`safe_inverse`)                                   | W/kernels/transform_local.wgsl:22                                                                  | canônica (classe TRS: barata)                                                               |
| normal geral `transpose(inverse(M3))`                                 | W/kernels/transform_compose_fn.wgsl:21; `node_space_normal` W/nodes/space.wgsl:15; combineSpace.ts | canônica afim; `node_space_normal` passa a ler a normal guardada quando o ponto é do objeto |
| `trsOf` (CPU)                                                         | elements/physics/flows/SurfaceColliderFlow.ts:556                                                  | unificar (muda resultado: não normaliza o quaternion e trata escala 0 diferente da GPU)     |
| `mat3_from_quat`                                                      | W/math/mat.wgsl:17                                                                                 | canônica                                                                                    |
| `quat_to_mat4`, `mat4_upper3x3_transform`                             | W/math/mat.wgsl:31, :7                                                                             | remover (sem usuário em produção) ou virar a canônica se a família pedir                    |
| `frameRotation` (CPU)                                                 | elements/lighting/ProbeFlow.ts:170                                                                 | unificar com a referência de quaternion                                                     |
| `camera_perspective`/`_orthographic` (`if` duplicado)                 | camera_compose:22, camera_fn_ready:21                                                              | unificar numa função de projeção                                                            |
| deslocamento da amostra `shift·P` (3 cópias)                          | camera_compose:36, camera_compose_fn:22, shadow_matrix:24                                          | unificar                                                                                    |
| `camera_orthographic_box` vs `water_light_fit_box`                    | W/math/camera.wgsl:58; P/water/wgsl/water_light.wgsl ~18                                           | unificar                                                                                    |
| `node_space_point`/`_direction`/`_project` vs `m * vec4(p, 1)` inline | W/nodes/space.wgsl:7, :11, :31                                                                     | canônica (aplicar a ponto, a direção, projetar)                                             |
| `quat_rotate_vec`/`_inv`                                              | W/math/quat.wgsl:20, :26                                                                           | canônica (rígida por quaternion), física                                                    |

## 2. Espaços e reprojeção

| Conta                                   | Cópias                                                                                                                                         | Destino                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| NDC → uv/pixel `(x·½+½, ½−y·½)`         | ≥ 8 inline (gi_screen_sample:33, gi_screen_reproject:43, brdf:32, water_transmission:16, caustics:155, temporal_resolve:128, wire:30, sprites) | canônica no módulo de espaços                         |
| uv → NDC `(uv·2−1, 1−uv·2)`             | ≥ 12 inline (temporal_resolve:122, ray_camera:17, froxels ×4, forward_background:17, water ×3, refraction_screen:8, ui:24)                     | canônica                                              |
| divisão por w                           | nua, `max(w, 1e-6)`, `max(\|w\|, 1e-6)·sign(w)`                                                                                                | uma política nomeada                                  |
| pixel → raio de câmera / ponto da vista | `ray_camera`, `fs_background`, `water_field_camera` (cópia quase literal), `froxel_view_point`+`froxel_world`, `composite_view_pos`            | canônica: `ray_camera` sobe para o módulo de espaços  |
| tirar o deslocamento da amostra         | 3 jeitos: `ndc − jitter`, `unjitteredViewProjection`, `froxel_projection` (reconstrói)                                                         | um jeito: as matrizes sem deslocamento guardadas      |
| teste "é ortográfica?"                  | `p[3][3] == 1`, `abs(p[2].w) > 0.5`, `projection[3].w == 1`                                                                                    | canônica                                              |
| profundidade NDC → linear               | `taa_view_depth`, `water_linear_depth`, `water_scene_linear`                                                                                   | canônica                                              |
| vetor de movimento                      | `camera_motion` único; a montagem dos clips repetida em 6 shaders (3 cópias do offset de sprite) e à mão no fundo do TAA                       | canônica da montagem (ponto atual e anterior → vetor) |
| largura do pixel num ponto              | `refraction_footprint`, `surface_adapt:101`, `water_pixels_per_meter` (sem uso); escala por eixo em brdf:26, `water_affine_scale`              | canônica; `water_pixels_per_meter` remover            |
| largura do cone do raio                 | contrato em ray_hit.wgsl:11, todos os chamadores passam 0                                                                                      | fora do escopo (registrar para a retomada da 034)     |

### Referencial "anterior" e inversas guardadas

| Dado                             | Onde / quem escreve                                    | Situação                                                                                   | Destino                                                         |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `WorldTransform {world, normal}` | Transform.ts:54; TransformFlow                         | sem inversa: recalculada em ray_instances:74, surface_collider_build:117, nós, refração    | inversa de mundo guardada, sob demanda (FR-007)                 |
| `PreviousWorldTransform`         | Transform.ts:64; MotionHistoryFlow (só com o temporal) | sem inversa anterior                                                                       | mantém                                                          |
| `CameraMatrices`                 | Camera.ts:85; CameraFlow                               | sem inversas; o TAA inverte por pixel                                                      | ganha as inversas e a vista anterior                            |
| `gi_screen_history[0..4]`        | gi_screen_resolve.wgsl:108                             | cópia própria da vista-projeção anterior **com** deslocamento da amostra (não documentado) | unificar (muda resultado: passa à anterior sem deslocamento)    |
| `froxel_camera`                  | media_froxel_integrate.wgsl:13                         | cópia própria da vista e da vista-projeção anterior                                        | unificar                                                        |
| corte de câmera                  | `cam.history.x` (camera_compose.wgsl:34)               | só o antisserrilhado lê; sondas de tela, névoa e filtro do sinal traçado não               | todos os históricos leem (muda resultado só no quadro do corte) |
| `camera_compose_fn`              | camera_compose_fn.wgsl:29                              | reescreve a vista-projeção sem deslocamento, não a anterior                                | revisar junto com o referencial                                 |

## 3. Hash e números aleatórios

| Definição                                                                                       | Onde                                                                                                                                 | Bit a bit?                                       | Destino                                                                               |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `pcg_hash` (PCG RXS-M-XS)                                                                       | W/math/noise.wgsl:7                                                                                                                  | sim (nós, conjuntos, emissores)                  | canônica                                                                              |
| `diffuse_hash`, `ray_direct_hash` (+ `gi_hash`), inline em `froxel_rotation` e `diffuse_dither` | diffuse_common:26, ray_direct:13, gi_direct:6, media_common:52, diffuse_sprite:73                                                    | cópias literais                                  | unificar (sem mudar bits)                                                             |
| `hash2`, `hash3`, `hash_signed`                                                                 | W/math/noise.wgsl:13, :17, :22                                                                                                       | sim                                              | canônica (`hash_signed` em [−1, 1] fechado: variante nomeada)                         |
| Teschner `(x·73856093) ^ (y·19349663) ^ (z·83492791)`                                           | `sh_hash`, `field_bucket`, `field_super_bucket`, `gi_photon_bucket`, `froxel_rotation`, `diffuse_dither`, `refraction_stratum_pixel` | sim na física (ordem dos vizinhos)               | canônica da família de **endereçamento** (a redução `&`/`%` fica com quem chama)      |
| `rb_warm_home` (Knuth)                                                                          | W/math/lcp_state.wgsl:13                                                                                                             | provável (warm start do LCP)                     | variante nomeada de endereçamento                                                     |
| gerador `H(s + 0x9e3779b9)`                                                                     | `refraction_random`, `gi_photon_random`                                                                                              | consistência traçado↔gradiente                   | canônico (com fluxo)                                                                  |
| u32 → [0, 1)                                                                                    | `(h>>8)/2²⁴` ×3; `(h & 0xFFFFFF)/2²⁴` ×2; `f32(h)/2³²` ×2 (**pode dar 1,0**); `(h & 0xFFFF)/65536`                                   | —                                                | canônica `(h>>8)/2²⁴`; `f32(h)/2³²` das partículas difusas: unificar (muda resultado) |
| sementes por constantes à mão                                                                   | 9781/6271 repetidas (sondas do mundo e refração); 1973/9277 (sondas de tela e fótons)                                                | —                                                | fluxos nomeados (US2 cenário 3)                                                       |
| `node_noise_seed2/3`                                                                            | W/nodes/noise.wgsl:22                                                                                                                | sim                                              | mantém (constantes da família)                                                        |
| Halton                                                                                          | TemporalAntialiasing.ts:38 (exportada); FroxelFlow.ts:83 (privada)                                                                   | sim (testes com oráculo)                         | canônica a exportada                                                                  |
| Fibonacci esférica                                                                              | `gi_fibonacci` (eixo z); sky_multiscatter:24 (eixo y)                                                                                | espelhos na CPU                                  | variantes nomeadas                                                                    |
| R2, Hammersley, ruído intercalado                                                               | gi_screen_trace:25; pbr_dfg_build:28; present.wgsl:75                                                                                | —                                                | únicas; ficam no módulo de sequências                                                 |
| CPU: `pcgHash`, `ProbeFlow.random`, `pathTracer.hash`                                           | nodes/reference/noise.ts:5; ProbeFlow.ts:163; pathTracer.ts:239                                                                      | `pcgHash` sim                                    | unificar na referência da CPU                                                         |
| smokes: mulberry32 ×6, LCG ×6, FNV-1a ×9                                                        | `src/__smokes__/**`, testes                                                                                                          | mulberry32 de `particleScenes` sim (trajetórias) | infraestrutura de teste: unificar sem mudar a sequência de `particleScenes`           |

## 4. Cor

| Definição                                                               | Onde                                                                  | Domínio / pesos                                                            | Destino                                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `luminance`                                                             | W/math/color.wgsl:10                                                  | **BT.601 sobre luz linear** (filtro do sinal traçado; smoke shaderLibrary) | unificar (muda resultado) na Rec.709                                                  |
| `ray_direct_luminance`, `node_color_luminance`                          | ray_direct:19, nodes/color:49                                         | Rec.709 linear                                                             | canônica Rec.709                                                                      |
| `refraction_luminance`, `gi_luminance`                                  | refraction_path:42, gi_direct:19                                      | apelidos (`gi_luminance` sem uso)                                          | unificar / remover                                                                    |
| luma YCoCg (¼, ½, ¼)                                                    | forward.wgsl:128 inline; `taa_ycocg` temporal_resolve:45              | espaço de recorte, não fotometria                                          | variante nomeada (`ycocg`), uma definição                                             |
| maior canal                                                             | `gi_response_value`, limiar do bloom                                  | intencional                                                                | variante nomeada                                                                      |
| `srgb_encode` / `srgb_encode_extended`                                  | W/math/present.wgsl:62, :68                                           | a curva repetida                                                           | uma curva, duas faixas                                                                |
| sRGB → linear                                                           | inline em `node_color_temperature` (nodes/color:45); CPU `srgbDecode` | sem função em WGSL                                                         | canônica `srgb_decode`                                                                |
| `gamma_encode`                                                          | W/math/color.wgsl:5                                                   | gradação sobre HDR (parâmetro)                                             | variante nomeada (gradação, não tela)                                                 |
| meia precisão RGB: `gi_unpack_rgb`, `gi_unpack_generation`, `gi_unpack` | gi_probe_blend:19, gi_generation:6, gi_probe_atlas:38                 | cópias exatas                                                              | unificar                                                                              |
| smokes: Rec.709 inline ~15 cópias                                       | support/images.ts, imageMeasures.ts etc.                              | a maioria sobre bytes sRGB (é luma)                                        | unificar numa medida de suporte, com o nome certo (luma de sRGB vs luminância linear) |

## 5. Outras constantes e amostragens

| Família                                               | Cópias                                                                                          | Destino                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| π                                                     | `SKY_PI`, `GI_PI`, `BSDF_PI`, `FROXEL_PI`; literal nas SPH (mesmo f32)                          | uma constante `PI` (sem mudar bits)                          |
| 2π                                                    | 4 literais + `2·*_PI`                                                                           | `TAU`                                                        |
| base ortonormal de Duff                               | `refraction_basis`, `gi_screen_basis` (idênticas), `closure_default_tangent`, nodes/geometry:16 | canônica                                                     |
| base por produto vetorial                             | `gi_photon_basis`, `diffuse_basis`, emit_fn_ready:40, CPU `basis` (limiares diferentes)         | variante nomeada única (muda resultado onde o limiar difere) |
| cosseno no hemisfério, esfera, cone, disco, triângulo | inline em gi_screen_trace, gi_photon_trace, emit_fn_ready, diffuse_spawn, set_distribute_sample | módulo de amostragem                                         |
| épsilons                                              | inline (1e-3 … 1e-30); só `SDF_EPS` nomeado                                                     | fora do escopo, salvo os das famílias acima                  |

## 6. Acumuladores temporais

| Acumulador              | Domínio          | Histórico (formato)                                                     | Reprojeção                                                             | Validação                                | Peso                                 | Momentos                                      | Filtro espacial                             | Corte |
| ----------------------- | ---------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------ | --------------------------------------------- | ------------------------------------------- | ----- |
| Antisserrilhado         | pixel            | cor `rgba16float` (alfa = quadros), estado `rg32float`, luz `rg16float` | vetor de movimento; fundo pela inversa por pixel                       | distância, reativa, variância YCoCg      | adaptativo; acumulação 1/n até 4096  | não (caixa do quadro)                         | reconstrução 3×3; nitidez fora do histórico | sim   |
| Sondas de tela (GI)     | ladrilho (sonda) | buffer f32, duas metades                                                | ponto do mundo pela vista-projeção anterior própria (com deslocamento) | plano e normal                           | `gi_response` (histerese adaptativa) | estado da resposta                            | 5×5 só para o desenho                       | não   |
| Sondas do mundo (DDGI)  | sonda fixa       | f16 empacotado em u32                                                   | nenhuma                                                                | reset por célula                         | `gi_response`                        | estado da resposta; visibilidade de Chebyshev | lóbulo na mistura                           | —     |
| Névoa (froxels)         | célula 3D        | `rgba16float` 3D                                                        | ponto do mundo pela câmera anterior própria                            | só dentro do volume                      | histerese fixa 0,9                   | não                                           | não                                         | não   |
| Filtro do sinal traçado | pixel            | `rgba16float`; guia `rgba32float`                                       | vetor de movimento da superfície + ponto anterior                      | id e ponto (largura do pixel); gradiente | `mix(1/n, 1, mudança)`, n ≤ 256      | sim                                           | à-trous 5 passos                            | não   |
| Cáusticas por fótons    | célula do mundo  | f32 por bitcast                                                         | nenhuma                                                                | reset por ocupação                       | histerese fixa 0,95                  | não                                           | trilinear na leitura                        | —     |
| Cáusticas da água       | texel da luz     | f32 por bitcast                                                         | nenhuma                                                                | reset pela matriz da luz                 | adaptativo                           | não                                           | tenda 3×3                                   | —     |

Destino: os quatro primeiros e o filtro do sinal traçado compartilham peças (reprojeção por ponto, validação por guia,
políticas de peso, momentos, corte de câmera) — ver research R5. DDGI e as duas cáusticas não reprojetam: ficam fora
do acumulador genérico, usando só a política de peso comum quando couber.

**Precisão (achado sem medida, FR-011)**: o contador de quadros do antisserrilhado fica no alfa `rgba16float`; em 16
bits, os inteiros só são exatos até 2048, então o teto de 4096 do modo de acumulação nunca é alcançado, e a média
uniforme desse modo também é guardada em 16 bits.

**Canal temporal (2026-10-24, R10, T053–T060)**: os históricos dos quatro acumuladores de luz passam a ser canais
temporais da C2 (`GPUDescriptor.history`), e a energia dos corpos rígidos entra como quinta instância, de outro domínio:

| Acumulador               | Antes (no estágio)                                                                 | Agora (canal da C2)                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------- |
| Antisserrilhado          | 6 texturas privadas (cor, estado, luz × 2), pipelines por paridade e formato       | `TemporalAntialiasing.history                                                              | state              | light` (2 fatias); um pipeline por formato    |
| Sondas de tela (GI)      | um buffer privado com cabeçalho morto (5 vec4f) e duas metades por paridade        | `GlobalIllumination.screenHistory` (buffer, 2 fatias; capacidade no recurso)               |
| Névoa (froxels)          | `history0/1` com injeção e integração por paridade; 32 bits sem conferir a feature | `Froxels.history` (3D, 2 fatias, lida filtrada; precisão e recuo pela C2)                  |
| Filtro do sinal traçado  | 3 cópias de textura por quadro (guia, média, momentos)                             | `TemporalFilter.accumulated                                                                | accumulatedMoments | guide`(2 fatias; o guia em bits,`rgba32uint`) |
| Energia (física, nova)   | —                                                                                  | pool `BodyEnergy` no slot do `RigidBody` (8 fatias: a janela)                              |
| Energia dos corpos moles | —                                                                                  | pool `SoftBodyEnergy` no slot da faixa do `SoftBody` (8 fatias; XPBD, FEM, MPM; T061–T066) |

Saem do código dos estágios: a paridade (4 lugares), os pares de alocação e liberação, o recuo de precisão com aviso
(2 cópias), as cópias por quadro (3) e os pipelines duplicados por paridade (antisserrilhado, névoa). A validade do
histórico da névoa passa a ser a idade da fatia anterior (`age(1) === 1`), no lugar do `ran` do estágio.

## 7. Limites do adaptador

- Pedidos ao adaptador (`core/gpu/GpuContext.ts:17-24`): só os de escala (`maxBufferSize`,
  `maxStorageBufferBindingSize`, `maxStorageBuffersPerShaderStage`, `maxBindGroups`, `maxComputeWorkgroupStorageSize`,
  `maxComputeInvocationsPerWorkgroup`). O resto fica no padrão, inclusive `maxStorageTexturesPerShaderStage` (4),
  `maxSampledTexturesPerShaderStage` (16), `maxColorAttachments` (8) e `maxColorAttachmentBytesPerSample` (32).
- Nenhuma ferramenta registra os limites crus do adaptador (o relatório guarda os do dispositivo). M4 (Chrome 155,
  bench de 2026-10-20): `maxStorageBuffersPerShaderStage` 10; os não pedidos aparecem com o padrão. RTX 4090: sem
  registro.
- Conferência: `scene/systems/flowBinding/limits.ts:29` (`checkLayoutLimits`); smoke `deviceFloor` fixa o piso do M4
  (`limitsCeiling: { maxStorageBuffersPerShaderStage: 10 }`).

## 8. Exigências bit a bit (não mudar sem decisão do usuário)

`pcg_hash`, `hash2`, `hash3`, `hash_signed` e as sementes dos nós (noiseReference.test, library.test, smoke
`shaderLibrary`); `hash3` + `set_hash_unit` (nodeGraphs, setReference.test); `emit_rand` (fixtures `extensionPoints`,
`parametricSurfaces`); `sh_hash` e as tabelas espaciais (SpatialHashGrid.test; `trajectories`, tolerância 0); o
mulberry32 de `support/particleScenes.ts` (posições iniciais de `trajectories`); `refraction_seed`/`refraction_random`
(consistência entre o traçado e o gradiente).

## 9. Contagem de base (T002, estado `d38416d6`)

277 arquivos `.wgsl`, 15 636 linhas. As definições nomeadas deste inventário somam 278 linhas. Ocorrências por
assinatura (a guarda da T004 usa as mesmas):

| Assinatura                                | Ocorrências | Arquivos |
| ----------------------------------------- | ----------- | -------- |
| PCG (`747796405`)                         | 5           | 5        |
| Teschner (`73856093`)                     | 7           | 6        |
| luminância Rec.709 (`0.2126`)             | 2           | 2        |
| luminância BT.601 (`0.299`)               | 1           | 1        |
| curva sRGB (`0.04045` / `0.0031308`)      | 3           | 2        |
| π literal (`3.14159`)                     | 10          | 5        |
| 2π literal (`6.28318`)                    | 5           | 4        |
| base de Duff (`1.0 / (sign + n.z)`)       | 4           | 4        |
| NDC → uv (`* 0.5 + 0.5`)                  | 13          | 11       |
| uv → NDC (`* 2.0 - 1.0`)                  | 20          | 16       |
| `transpose(mat3x3f(` (inversa da rotação) | 8           | 8        |

Alvo de SC-005: cada assinatura em um arquivo (o módulo dono), e as linhas das famílias não crescem.

## 10. Contagem depois (T049)

289 arquivos `.wgsl` (12 novos: `constants`, `random`, `hash_address`, `basis`, `sampling`, `xform_rigid`,
`xform_affine`, `xform_projective`, `xform_trs`, `view_space`, `camera_space`, `temporal`, mais o kernel
`transform_inverse`; saiu o `ray_camera`), 15 783 linhas (base 15 636: +147 — os 13 arquivos novos somam 420 linhas; nos arquivos que já existiam saíram 630 e
entraram 357, −273).

| Assinatura                        | Base (fora do dono) | Depois (fora do dono)                                                  |
| --------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| PCG                               | 5 arquivos          | 0                                                                      |
| Teschner                          | 6                   | 0                                                                      |
| Knuth                             | 1                   | 0                                                                      |
| luminância Rec.709                | 2 (+14 nos smokes)  | 0                                                                      |
| luminância BT.601                 | 1 (+1 no smoke)     | 0 no WGSL fora do dono; o espelho do smoke sai com a T015 (decisão)    |
| curva sRGB                        | 2 (+1 na CPU)       | 0                                                                      |
| π / 2π literais                   | 9 (+3 nos smokes)   | 0 no motor; 3 no código de usuário de exemplo dos smokes (justificado) |
| base de Duff                      | 4                   | 0                                                                      |
| NDC → uv / uv → NDC               | 8 / 12              | 0 / 0                                                                  |
| inversa da rotação por transposta | 8                   | 0                                                                      |

A lista de pendências do `canonicalSignatures.test.ts` ficou com os três
literais de 2π em código de usuário dos smokes (funções `transform` e `surface` escritas como o desenvolvedor as
escreve; o módulo `constants` não é parte do contrato dessas funções). SC-005: cada assinatura no módulo dono; as
linhas das famílias caíram (as cópias saíram) e o total subiu só pelo que é matemática nova ou contrato novo (peças
temporais, inversa de mundo, espaços pela câmera).
