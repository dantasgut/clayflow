// Tipos do ponto `emit` (spec 009): a partícula que a função de emissão devolve e o sorteio determinístico por
// (índice, semente, canal) em [0, 1).
// Requer: noise.

struct EmittedParticle {
    position: vec3f,
    velocity: vec3f,
    life: f32,
    color: vec4f,
}

fn emit_rand(i: u32, seed: u32, channel: u32) -> f32 {
    return random_unit(hash3(vec3u(i, seed, channel)));
}
