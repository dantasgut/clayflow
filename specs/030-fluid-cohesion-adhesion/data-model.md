# Data Model: Coesão e adesão de fluidos

## ParticleMaterial (C3, alterado)

Recurso único por cena; uniform de dado do World (80 B, era 64 B).

| Campo       | Tipo | Padrão | Validação      | Significado                                                                  |
| ----------- | ---- | ------ | -------------- | ---------------------------------------------------------------------------- |
| `cohesion`  | f32  | 0      | ≥ 0, finito    | Tensão superficial adimensional (R2): 1 ≈ aceleração de coesão da ordem de g |
| `adhesion`  | f32  | 0      | ≥ 0, finito    | Adesão às fronteiras sólidas (R3): 1 ≈ aceleração de contato da ordem de g   |
| `xsph`      | f32  | 0,05   | ≥ 0, finito    | Suavização de velocidade XSPH (SPH e PBF)                                    |
| `viscosity` | f32  | 0,01   | (já existente) | Passa a valer também no MPM fluido (R7)                                      |

Acessores novos: `cohesion`, `adhesion`, `xsph`; constantes `WATER_COHESION` (3) e `WATER_ADHESION` (8), calibradas
pelo smoke `fluidBehavior`; derivados `cohesionGamma()` (γ de Akinci), `adhesionAccel()` (m/s², escala da integral de
meio-espaço) e `adhesionTangential()` (1/s); `surfaceStep(stepDt, dtSolver, mínimo)` → `{ substeps, cohesion,
adhesion, clamped }` (R6). `mpmStableDt` ganha a restrição viscosa dx²ρ₀/(6 μ).

## SPHSimParams / PBFSimParams (C3, alterados)

Campos novos (fim do struct): `cohesion_gamma: f32`, `adhesion_accel: f32`, `adhesion_tangential: f32`,
`support: f32` (H). O domínio continua só `bound_min` (A6). `xsph_c` passa a vir do material.

## MPMSimParams (C3)

Sem campo novo: `viscosity` já existe e passa a ser lido em `mpm_p2g`.

## Buffers privados (C3, Flows)

| Flow      | Buffer       | Layout                             | Escrito por     | Lido por     |
| --------- | ------------ | ---------------------------------- | --------------- | ------------ |
| `SPHFlow` | `sph_normal` | `array<vec4f>` (n.xyz), 64k × 16 B | `sph_normals`   | `sph_forces` |
| `PBFFlow` | `pbf_normal` | `array<vec4f>` (n.xyz), 64k × 16 B | `pbf_vorticity` | `pbf_xsph`   |

Alocados na criação do Flow como os de vizinhança (sem custo por quadro); o passe que os escreve só é gravado com
coesão > 0.

## Fronteira genérica (WGSL, `math/collider_set.wgsl`)

`ColliderHit { dist, normal }` (existente) é a fronteira. Novo: `collider_set_adhesion(p, v, H, beta, beta_t,
bound_min) -> vec3f` (aceleração somada sobre planos do domínio e colliders plano/caixa/esfera, R3).

## Estados

Sem máquina de estados nova: os Flows continuam `running`; o aviso de grampeamento (R6) é emitido uma vez por
material (guardado no Flow por identidade do material).
