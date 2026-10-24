// Partículas secundárias de um fluido — spray, espuma e bolhas (spec 010; Ihmsen et al. 2012, "Unified Spray, Foam and
// Bubbles for Particle-Based Fluids"). Peças comuns: leitura das partículas do fluido no pool (layout pelo schema:
// passo e deslocamentos em floats), o peso radial W(r) = 1 − r/h, números pseudoaleatórios determinísticos e o tipo.
// Requer: struct `DiffuseParams`; os recursos `diffuse_params` e `fluid` (array<f32>).

const DIFFUSE_SPRAY: f32 = 0.0;
const DIFFUSE_FOAM: f32 = 1.0;
const DIFFUSE_BUBBLE: f32 = 2.0;

fn diffuse_fluid_pos(j: u32) -> vec3f {
    let o = j * diffuse_params.fluid_stride + diffuse_params.pos_offset;
    return vec3f(fluid[o], fluid[o + 1u], fluid[o + 2u]);
}

fn diffuse_fluid_vel(j: u32) -> vec3f {
    let o = j * diffuse_params.fluid_stride + diffuse_params.vel_offset;
    return vec3f(fluid[o], fluid[o + 1u], fluid[o + 2u]);
}

// Peso radial de Ihmsen: 1 − r/h dentro do raio h.
fn diffuse_weight(r: f32) -> f32 {
    return select(0.0, 1.0 - r / diffuse_params.h, r < diffuse_params.h);
}

fn diffuse_rand(a: u32, b: u32, k: u32) -> f32 {
    return random_unit(random_seed(RANDOM_STREAM_DIFFUSE, a, b * 1664525u + k * 1013904223u));
}

// Φ(I, τmin, τmax): potencial normalizado em [0, 1].
fn diffuse_clamp(i: f32, lo: f32, hi: f32) -> f32 {
    return (min(i, hi) - min(i, lo)) / max(hi - lo, 1e-9);
}
