// Nós de ruído (spec 031, R12) sobre a `wgslLib.noise`: a posição `p · scale + offset` e a semente, que desloca a célula
// inteira da rede (`node_noise_seed*`: semente 0 = o ruído da biblioteca, sem deslocamento) — aritmética inteira, a mesma
// na referência da CPU. Valor e gradiente em 2D e 3D, celular (Worley: distâncias ao ponto mais próximo e ao segundo, e
// o valor da célula mais próxima) e fBm (oitavas do ruído de gradiente, cada uma com a semente seguinte).
// Filtragem na origem (spec 034, H6): `width` é a largura do pixel (ou do cone do raio) no espaço de `p`; quando a célula
// do ruído fica menor que o pixel, a oitava se esvai para a média dela (0) em vez de cintilar — fator
// `1 − smoothstep(0,25; 0,75; width · escala)`; `width` 0 = sem filtragem (o ruído de antes, bit a bit).
// Período (spec 041, R3): `period` > 0 torna o ruído ladrilhável — o índice da célula módulo `period` em unidades de
// `p · scale` (a saída repete a cada `period / scale` em `p`); 0 = sem período (o ruído de antes, bit a bit). No fBm, a
// oitava k usa `floor(period · lacunarity^k + 0,5)` (periódico exato com `lacunarity` inteira).
// Requer: noise.

struct NodeCellular {
    f1: f32,
    f2: f32,
    cell: f32,
}

// Fator da oitava pela largura do pixel em células (`w` = largura · frequência): 1 abaixo de ¼ de célula, 0 acima de ¾.
fn node_noise_band(w: f32) -> f32 {
    return 1.0 - smoothstep(0.25, 0.75, w);
}

// Deslocamento da célula pela semente (produto u32 com constantes ímpares de mistura; envolve em 2³²).
fn node_noise_seed2(seed: u32) -> vec2u {
    return seed * vec2u(0x9e3779b1u, 0x85ebca77u);
}

fn node_noise_seed3(seed: u32) -> vec3u {
    return seed * vec3u(0x9e3779b1u, 0x85ebca77u, 0xc2b2ae3du);
}

fn node_noise_value2(p: vec2f, width: f32, scale: f32, offset: vec2f, seed: u32, period: u32) -> f32 {
    let q = p * scale + offset;
    var v: f32;
    if (period > 0u) {
        v = value_noise2_period(noise_wrap2(q, period), fract(q), period, node_noise_seed2(seed));
    } else {
        v = value_noise2_cell(noise_cell2(q) + node_noise_seed2(seed), fract(q));
    }
    return select(v, v * node_noise_band(width * scale), width > 0.0);
}

fn node_noise_gradient2(p: vec2f, width: f32, scale: f32, offset: vec2f, seed: u32, period: u32) -> f32 {
    let q = p * scale + offset;
    var v: f32;
    if (period > 0u) {
        v = gradient_noise2_period(noise_wrap2(q, period), fract(q), period, node_noise_seed2(seed));
    } else {
        v = gradient_noise2_cell(noise_cell2(q) + node_noise_seed2(seed), fract(q));
    }
    return select(v, v * node_noise_band(width * scale), width > 0.0);
}

fn node_noise_value3(p: vec3f, width: f32, scale: f32, offset: vec3f, seed: u32, period: u32) -> f32 {
    let q = p * scale + offset;
    var v: f32;
    if (period > 0u) {
        v = value_noise3_period(noise_wrap3(q, period), fract(q), period, node_noise_seed3(seed));
    } else {
        v = value_noise3_cell(noise_cell3(q) + node_noise_seed3(seed), fract(q));
    }
    return select(v, v * node_noise_band(width * scale), width > 0.0);
}

fn node_noise_gradient3(p: vec3f, width: f32, scale: f32, offset: vec3f, seed: u32, period: u32) -> f32 {
    let q = p * scale + offset;
    var v: f32;
    if (period > 0u) {
        v = gradient_noise3_period(noise_wrap3(q, period), fract(q), period, node_noise_seed3(seed));
    } else {
        v = gradient_noise3_cell(noise_cell3(q) + node_noise_seed3(seed), fract(q));
    }
    return select(v, v * node_noise_band(width * scale), width > 0.0);
}

// Celular 3D: um ponto por célula, no centro deslocado por `jitter · ([-0,5; 0,5]³ pelo hash)`; distâncias euclidianas
// ao mais próximo (`f1`) e ao segundo (`f2`) entre as 27 células vizinhas, e o valor em [0, 1] da célula mais próxima.
fn node_noise_cellular3(p: vec3f, scale: f32, offset: vec3f, seed: u32, jitter: f32, period: u32) -> NodeCellular {
    let q = p * scale + offset;
    let periodic = period > 0u;
    let so = node_noise_seed3(seed);
    // Com período, a célula reduzida (sem a semente); a vizinha é `(c + P + d) mod P` mais a semente.
    let c = select(noise_cell3(q) + so, noise_wrap3(q, period), periodic);
    let f = fract(q);
    var d1 = 1e30;
    var d2 = 1e30;
    var h1 = 0u;
    for (var dz = -1; dz <= 1; dz++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                let o = vec3i(dx, dy, dz);
                let raw = c + bitcast<vec3u>(o);
                let h = hash3(select(raw, (raw + vec3u(period)) % max(period, 1u) + so, periodic));
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
// cada uma, semente + k na oitava k; normalizada pela soma das amplitudes (em [-1, 1]); cada oitava filtrada pela
// largura do pixel na frequência dela.
fn node_noise_fbm3(
    p: vec3f,
    width: f32,
    scale: f32,
    offset: vec3f,
    seed: u32,
    octaves: u32,
    lacunarity: f32,
    gain: f32,
    period: u32,
) -> f32 {
    var q = p * scale + offset;
    var pk = f32(period);
    var amp = 1.0;
    var sum = 0.0;
    var norm = 0.0;
    // Largura do pixel em células da oitava (cresce com a frequência); a normalização é a das amplitudes cheias, então as
    // oitavas esvaídas puxam o valor para a média (0), sem reescalar as que restam.
    var w = width * scale;
    let n = clamp(octaves, 1u, 12u);
    for (var k = 0u; k < n; k++) {
        var v: f32;
        if (period > 0u) {
            let pu = max(u32(floor(pk + 0.5)), 1u);
            v = gradient_noise3_period(noise_wrap3(q, pu), fract(q), pu, node_noise_seed3(seed + k));
        } else {
            v = gradient_noise3_cell(noise_cell3(q) + node_noise_seed3(seed + k), fract(q));
        }
        pk *= lacunarity;
        sum += amp * select(v, v * node_noise_band(w), width > 0.0);
        norm += amp;
        amp *= gain;
        q *= lacunarity;
        w *= lacunarity;
    }
    return sum / norm;
}
