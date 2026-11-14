# Contrato — matemática canônica para autores de extensões (037)

O que um autor de funções e efeitos (WGSL nas funções de material, de transformação, de câmera, nos nós) pode chamar e
o que muda para ele. Assinaturas finais podem ganhar parâmetros nomeados na implementação; os nomes e o comportamento
abaixo são o contrato.

## Garantias

- Cada conta tem uma definição; o nome diz a classe ou o domínio (`rigid_`, `affine_`, `projective_`, `random_`,
  `hash_cell`, `luminance`). Nenhuma escolha por classe acontece em execução.
- Os resultados das famílias bit a bit não mudam: `pcg_hash`, `hash2`, `hash3`, `hash_signed`, as sementes dos nós,
  `emit_rand`, `hash_cell` (a ordem dos vizinhos da física), a sequência dos emissores.
- `luminance(c)` é a luminância Rec.709 de luz **linear**. Quem precisava de BT.601 não tem uso correto em luz linear.
- `random_unit` está em [0, 1), nunca 1.

## Funções públicas

### Aleatoriedade

```wgsl
fn pcg_hash(v: u32) -> u32
fn hash2(p: vec2u) -> u32
fn hash3(p: vec3u) -> u32
fn hash_signed(h: u32) -> f32               // [-1, 1] fechado
fn random_seed(stream: u32, index: u32, frame: u32) -> u32
fn random_next(state: ptr<function, u32>) -> u32
fn random_unit(h: u32) -> f32               // [0, 1)
// fluxos: RANDOM_STREAM_* (constantes compartilhadas); uma extensão usa RANDOM_STREAM_USER + n
```

### Endereçamento

```wgsl
fn hash_cell(c: vec3u) -> u32               // Teschner, sem a redução (com sinal: bitcast<vec3u>)
fn hash_knuth(key: u32) -> u32
```

### Cor

```wgsl
fn luminance(c: vec3f) -> f32               // Rec.709, luz linear
fn max_channel(c: vec3f) -> f32
fn ycocg(c: vec3f) -> vec3f
fn ycocg_inverse(c: vec3f) -> vec3f
fn srgb_encode(c: vec3f) -> vec3f           // [0, 1]
fn srgb_encode_extended(c: vec3f) -> vec3f  // sem teto (HDR)
fn srgb_decode(c: vec3f) -> vec3f
fn grade_gamma(c: vec3f, gamma: f32) -> vec3f
```

### Transformações

```wgsl
fn rigid_compose(a: mat4x4f, b: mat4x4f) -> mat4x4f
fn rigid_inverse(m: mat4x4f) -> mat4x4f
fn rigid_point(m: mat4x4f, p: vec3f) -> vec3f
fn rigid_direction(m: mat4x4f, d: vec3f) -> vec3f
fn affine_compose(a: mat4x4f, b: mat4x4f) -> mat4x4f
fn affine_inverse(m: mat4x4f) -> mat4x4f    // det ≤ 1e-20 → identidade
fn affine_point(m: mat4x4f, p: vec3f) -> vec3f
fn affine_direction(m: mat4x4f, d: vec3f) -> vec3f
fn affine_normal(m: mat4x4f) -> mat3x3f     // (M3)⁻ᵀ
fn projective_inverse(m: mat4x4f) -> mat4x4f
fn projective_point(m: mat4x4f, p: vec3f) -> vec3f
fn trs_world(position: vec3f, rotation: vec4f, scale: vec3f) -> mat4x4f
fn trs_normal(rotation: vec4f, scale: vec3f) -> mat3x3f
```

### Espaços

```wgsl
fn ndc_to_uv(ndc: vec2f) -> vec2f
fn uv_to_ndc(uv: vec2f) -> vec2f
fn clip_divide(clip: vec4f) -> vec3f
fn is_orthographic(projection: mat4x4f) -> bool
fn view_depth(ndc_z: f32, projection: mat4x4f) -> f32
fn camera_ray(slot: u32, pixel: vec2f, size: vec2f) -> RayCamera
fn motion_vector(previous_world: vec3f, world: vec3f, slot: u32) -> vec2f
fn pixel_footprint(slot: u32, size: vec2f, world: vec3f) -> f32
```

### Dados lidos (pools)

- `world_inverses[slot].inverse` — a inversa afim do mundo (sob demanda: ligar o recurso a aloca).
- `cameras[slot].inverseView`, `.inverseUnjitteredViewProjection`, `.previousView` (além dos campos atuais).

## Renomeações e remoções (migração)

| Antes                                                                                  | Depois                                                           | Muda bits?                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `diffuse_hash`, `ray_direct_hash`, `gi_hash`                                           | `pcg_hash`                                                       | não                                                                        |
| `refraction_random`, `gi_photon_random`                                                | `random_next` + `random_unit`                                    | não na conta; sim nas sementes (fluxos)                                    |
| `ray_direct_luminance`, `refraction_luminance`, `gi_luminance`, `node_color_luminance` | `luminance` (Rec.709)                                            | não                                                                        |
| `luminance` (BT.601)                                                                   | `luminance` (Rec.709)                                            | **sim** (filtro do sinal traçado; smoke `shaderLibrary`; aplicado na T048) |
| `gamma_encode`                                                                         | `grade_gamma`                                                    | não                                                                        |
| `rigid_mat4_inverse`                                                                   | `rigid_inverse`                                                  | não                                                                        |
| `ray_inverse_affine`, `node_space_inverse`                                             | `affine_inverse`                                                 | arredondamento (≤ tolerância)                                              |
| `taa_inverse`                                                                          | `projective_inverse` (lido de `CameraMatrices`)                  | arredondamento                                                             |
| `ray_camera`                                                                           | `camera_ray`                                                     | não                                                                        |
| `camera_motion`                                                                        | `motion_vector` (monta os clips)                                 | não                                                                        |
| `refraction_footprint`                                                                 | `pixel_footprint` + vizinhos (na fonte)                          | não                                                                        |
| `traced_denoise_*`, `TracedDenoiser`, `defaults.denoiser`                              | `temporal_filter_*`, `TemporalFilter`, `defaults.temporalFilter` | não                                                                        |
| `quat_to_mat4`, `mat4_upper3x3_transform`, `water_pixels_per_meter`, `gi_luminance`    | removidos                                                        | —                                                                          |

Nós (`space.*`, `color.luminance`) mantêm o nome público do nó; só a implementação passa à canônica.
