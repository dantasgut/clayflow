// Nós de ruído (spec 031, R12) sobre a `wgslLib.noise`: a posição `p · scale + offset` e a semente, que desloca a célula
// inteira da rede (`node_noise_seed*`: semente 0 = o ruído da biblioteca, sem deslocamento) — aritmética inteira, a mesma
// na referência da CPU. Valor e gradiente em 2D e 3D, celular (Worley: distâncias ao ponto mais próximo e ao segundo, e
// o valor da célula mais próxima) e fBm (oitavas do ruído de gradiente, cada uma com a semente seguinte).
// Requer: noise.

struct NodeCellular {
    f1: f32,
    f2: f32,
    cell: f32,
}

// Deslocamento da célula pela semente (produto u32 com constantes ímpares de mistura; envolve em 2³²).
fn node_noise_seed2(seed: u32) -> vec2u {
    return seed * vec2u(0x9e3779b1u, 0x85ebca77u);
}

fn node_noise_seed3(seed: u32) -> vec3u {
    return seed * vec3u(0x9e3779b1u, 0x85ebca77u, 0xc2b2ae3du);
}

fn node_noise_value2(p: vec2f, scale: f32, offset: vec2f, seed: u32) -> f32 {
    let q = p * scale + offset;
    return value_noise2_cell(noise_cell2(q) + node_noise_seed2(seed), fract(q));
}

fn node_noise_gradient2(p: vec2f, scale: f32, offset: vec2f, seed: u32) -> f32 {
    let q = p * scale + offset;
    return gradient_noise2_cell(noise_cell2(q) + node_noise_seed2(seed), fract(q));
}

fn node_noise_value3(p: vec3f, scale: f32, offset: vec3f, seed: u32) -> f32 {
    let q = p * scale + offset;
    return value_noise3_cell(noise_cell3(q) + node_noise_seed3(seed), fract(q));
}

fn node_noise_gradient3(p: vec3f, scale: f32, offset: vec3f, seed: u32) -> f32 {
    let q = p * scale + offset;
    return gradient_noise3_cell(noise_cell3(q) + node_noise_seed3(seed), fract(q));
}

// Celular 3D: um ponto por célula, no centro deslocado por `jitter · ([-0,5; 0,5]³ pelo hash)`; distâncias euclidianas
// ao mais próximo (`f1`) e ao segundo (`f2`) entre as 27 células vizinhas, e o valor em [0, 1] da célula mais próxima.
fn node_noise_cellular3(p: vec3f, scale: f32, offset: vec3f, seed: u32, jitter: f32) -> NodeCellular {
    let q = p * scale + offset;
    let c = noise_cell3(q) + node_noise_seed3(seed);
    let f = fract(q);
    var d1 = 1e30;
    var d2 = 1e30;
    var h1 = 0u;
    for (var dz = -1; dz <= 1; dz++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                let o = vec3i(dx, dy, dz);
                let h = hash3(c + bitcast<vec3u>(o));
                let hy = pcg_hash(h);
                let j = 0.5 * vec3f(hash_signed(h), hash_signed(hy), hash_signed(pcg_hash(hy)));
                let r = vec3f(o) + vec3f(0.5) + jitter * j - f;
                let d = dot(r, r);
                if (d < d1) {
                    d2 = d1;
                    d1 = d;
                    h1 = h;
                } else if (d < d2) {
                    d2 = d;
                }
            }
        }
    }
    return NodeCellular(sqrt(d1), sqrt(d2), f32(h1 >> 8u) / 16777215.0);
}

// fBm: soma de `octaves` (1 a 12) oitavas do ruído de gradiente 3D, frequência × `lacunarity` e amplitude × `gain` a
// cada uma, semente + k na oitava k; normalizada pela soma das amplitudes (em [-1, 1]).
fn node_noise_fbm3(
    p: vec3f,
    scale: f32,
    offset: vec3f,
    seed: u32,
    octaves: u32,
    lacunarity: f32,
    gain: f32,
) -> f32 {
    var q = p * scale + offset;
    var amp = 1.0;
    var sum = 0.0;
    var norm = 0.0;
    let n = clamp(octaves, 1u, 12u);
    for (var k = 0u; k < n; k++) {
        sum += amp * gradient_noise3_cell(noise_cell3(q) + node_noise_seed3(seed + k), fract(q));
        norm += amp;
        amp *= gain;
        q *= lacunarity;
    }
    return sum / norm;
}
