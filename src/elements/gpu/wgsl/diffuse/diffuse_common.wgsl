// Partículas secundárias de um fluido — spray, espuma e bolhas (spec 010; Ihmsen et al. 2012, "Unified Spray, Foam and
// Bubbles for Particle-Based Fluids"). Peças comuns: leitura das partículas do fluido no pool (layout pelo schema:
// passo e deslocamentos em floats), o peso radial W(r) = 1 − r/h, números pseudoaleatórios determinísticos e o tipo.
// Requer: struct `DiffuseParams`; o uniforme `diffuse_params` e o global `fluid` (array<f32>) do kernel.

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

// Hash PCG de 32 bits → [0, 1).
fn diffuse_hash(x: u32) -> u32 {
    var v = x * 747796405u + 2891336453u;
    let w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
    return (w >> 22u) ^ w;
}

fn diffuse_rand(a: u32, b: u32, k: u32) -> f32 {
    return f32(diffuse_hash(a ^ diffuse_hash(b * 1664525u + k * 1013904223u))) / 4294967296.0;
}

// Φ(I, τmin, τmax): potencial normalizado em [0, 1].
fn diffuse_clamp(i: f32, lo: f32, hi: f32) -> f32 {
    return (min(i, hi) - min(i, lo)) / max(hi - lo, 1e-9);
}
