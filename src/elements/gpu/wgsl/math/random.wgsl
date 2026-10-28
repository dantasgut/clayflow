// Aleatoriedade (spec 037, R2): a família única de hash para números aleatórios. `pcg_hash`, `hash2`, `hash3` e
// `hash_signed` são bit a bit (as sementes dos nós e a sequência dos emissores dependem deles); `random_next` é o
// gerador com estado e `random_unit` a conversão em [0, 1). O endereçamento (células, tabelas) é a outra família,
// `hash_address`. Referência f64: `elements/math/reference/random.ts`.

// Passo do gerador congruente do PCG (O'Neill).
fn pcg_step(state: u32) -> u32 {
    return state * 747796405u + 2891336453u;
}

// Permutação de saída RXS-M-XS de 32 bits do PCG.
fn pcg_output(state: u32) -> u32 {
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

// PCG (O'Neill), variante RXS-M-XS de 32 bits.
fn pcg_hash(v: u32) -> u32 {
    return pcg_output(pcg_step(v));
}

fn hash2(p: vec2u) -> u32 {
    return pcg_hash(p.x ^ pcg_hash(p.y));
}

fn hash3(p: vec3u) -> u32 {
    return pcg_hash(p.x ^ pcg_hash(p.y ^ pcg_hash(p.z)));
}

// Hash → [-1, 1] fechado.
fn hash_signed(h: u32) -> f32 {
    return f32(h >> 8u) * (2.0 / 16777215.0) - 1.0;
}

// Hash → [0, 1), nunca 1 (os 24 bits altos sobre 2²⁴).
fn random_unit(h: u32) -> f32 {
    return f32(h >> 8u) / 16777216.0;
}

// Fluxos nomeados (spec 037): cada uso tem o seu, para que efeitos diferentes no mesmo índice e quadro não tirem os
// mesmos números (correlação entre a refração e a luz global num pixel, por exemplo). Uma extensão usa
// RANDOM_STREAM_USER + n.
const RANDOM_STREAM_REFRACTION: u32 = 1u;
const RANDOM_STREAM_GI_WORLD: u32 = 2u;
const RANDOM_STREAM_GI_SCREEN_RAYS: u32 = 3u;
const RANDOM_STREAM_GI_SCREEN_LIGHT: u32 = 4u;
const RANDOM_STREAM_CAUSTICS: u32 = 5u;
const RANDOM_STREAM_DIFFUSE: u32 = 6u;
const RANDOM_STREAM_FROXEL: u32 = 7u;
const RANDOM_STREAM_USER: u32 = 64u;

// A semente do fluxo `stream` no índice `index` (pixel, sonda, partícula) e no quadro `frame`.
fn random_seed(stream: u32, index: u32, frame: u32) -> u32 {
    return hash3(vec3u(index, frame, stream));
}

// Gerador com estado: avança pela razão áurea e devolve o hash do estado (o novo estado).
fn random_next(state: ptr<function, u32>) -> u32 {
    *state = pcg_hash(*state + 0x9e3779b9u);
    return *state;
}
