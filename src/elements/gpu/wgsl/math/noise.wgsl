// Ruído determinístico (spec 005, R7): hash PCG de 32 bits e ruído de valor e de gradiente (Perlin) em 2D e 3D com
// interpolação quíntica. Saída em [-1, 1]. Gradientes por direções fixas escolhidas pelo hash (sem trigonometria), para
// que a referência em CPU reproduza os valores da GPU.

// PCG (O'Neill), variante RXS-M-XS de 32 bits.
fn pcg_hash(v: u32) -> u32 {
    let state = v * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash2(p: vec2u) -> u32 {
    return pcg_hash(p.x ^ pcg_hash(p.y));
}

fn hash3(p: vec3u) -> u32 {
    return pcg_hash(p.x ^ pcg_hash(p.y ^ pcg_hash(p.z)));
}

// Hash → [-1, 1].
fn hash_signed(h: u32) -> f32 {
    return f32(h >> 8u) * (2.0 / 16777215.0) - 1.0;
}

// Interpolação quíntica 6t⁵ − 15t⁴ + 10t³.
fn noise_fade(t: f32) -> f32 {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn noise_cell2(p: vec2f) -> vec2u {
    return bitcast<vec2u>(vec2i(floor(p)));
}

fn noise_cell3(p: vec3f) -> vec3u {
    return bitcast<vec3u>(vec3i(floor(p)));
}

fn value_noise2(p: vec2f) -> f32 {
    let c = noise_cell2(p);
    let f = fract(p);
    let a = hash_signed(hash2(c));
    let b = hash_signed(hash2(c + vec2u(1u, 0u)));
    let d = hash_signed(hash2(c + vec2u(0u, 1u)));
    let e = hash_signed(hash2(c + vec2u(1u, 1u)));
    let u = vec2f(noise_fade(f.x), noise_fade(f.y));
    return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}

fn value_noise3(p: vec3f) -> f32 {
    let c = noise_cell3(p);
    let f = fract(p);
    let u = vec3f(noise_fade(f.x), noise_fade(f.y), noise_fade(f.z));
    let v000 = hash_signed(hash3(c));
    let v100 = hash_signed(hash3(c + vec3u(1u, 0u, 0u)));
    let v010 = hash_signed(hash3(c + vec3u(0u, 1u, 0u)));
    let v110 = hash_signed(hash3(c + vec3u(1u, 1u, 0u)));
    let v001 = hash_signed(hash3(c + vec3u(0u, 0u, 1u)));
    let v101 = hash_signed(hash3(c + vec3u(1u, 0u, 1u)));
    let v011 = hash_signed(hash3(c + vec3u(0u, 1u, 1u)));
    let v111 = hash_signed(hash3(c + vec3u(1u, 1u, 1u)));
    let x00 = mix(v000, v100, u.x);
    let x10 = mix(v010, v110, u.x);
    let x01 = mix(v001, v101, u.x);
    let x11 = mix(v011, v111, u.x);
    return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}

// 8 direções no plano (eixos e diagonais), escolhidas pelos 3 bits baixos do hash.
fn noise_grad2(h: u32, f: vec2f) -> f32 {
    var dirs = array<vec2f, 8>(
        vec2f(1.0, 0.0), vec2f(-1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, -1.0),
        vec2f(0.70710678, 0.70710678), vec2f(-0.70710678, 0.70710678),
        vec2f(0.70710678, -0.70710678), vec2f(-0.70710678, -0.70710678),
    );
    return dot(dirs[h & 7u], f);
}

fn gradient_noise2(p: vec2f) -> f32 {
    let c = noise_cell2(p);
    let f = fract(p);
    let a = noise_grad2(hash2(c), f);
    let b = noise_grad2(hash2(c + vec2u(1u, 0u)), f - vec2f(1.0, 0.0));
    let d = noise_grad2(hash2(c + vec2u(0u, 1u)), f - vec2f(0.0, 1.0));
    let e = noise_grad2(hash2(c + vec2u(1u, 1u)), f - vec2f(1.0, 1.0));
    let u = vec2f(noise_fade(f.x), noise_fade(f.y));
    return clamp(1.41421356 * mix(mix(a, b, u.x), mix(d, e, u.x), u.y), -1.0, 1.0);
}

// 12 direções das arestas do cubo, escolhidas pelos 4 bits baixos do hash (Perlin 2002).
fn noise_grad3(h: u32, f: vec3f) -> f32 {
    let k = h & 15u;
    let u = select(f.y, f.x, k < 8u);
    let v = select(select(f.z, f.x, k == 12u || k == 14u), f.y, k < 4u);
    return select(-u, u, (k & 1u) == 0u) + select(-v, v, (k & 2u) == 0u);
}

fn gradient_noise3(p: vec3f) -> f32 {
    let c = noise_cell3(p);
    let f = fract(p);
    let u = vec3f(noise_fade(f.x), noise_fade(f.y), noise_fade(f.z));
    let g000 = noise_grad3(hash3(c), f);
    let g100 = noise_grad3(hash3(c + vec3u(1u, 0u, 0u)), f - vec3f(1.0, 0.0, 0.0));
    let g010 = noise_grad3(hash3(c + vec3u(0u, 1u, 0u)), f - vec3f(0.0, 1.0, 0.0));
    let g110 = noise_grad3(hash3(c + vec3u(1u, 1u, 0u)), f - vec3f(1.0, 1.0, 0.0));
    let g001 = noise_grad3(hash3(c + vec3u(0u, 0u, 1u)), f - vec3f(0.0, 0.0, 1.0));
    let g101 = noise_grad3(hash3(c + vec3u(1u, 0u, 1u)), f - vec3f(1.0, 0.0, 1.0));
    let g011 = noise_grad3(hash3(c + vec3u(0u, 1u, 1u)), f - vec3f(0.0, 1.0, 1.0));
    let g111 = noise_grad3(hash3(c + vec3u(1u, 1u, 1u)), f - vec3f(1.0, 1.0, 1.0));
    let x00 = mix(g000, g100, u.x);
    let x10 = mix(g010, g110, u.x);
    let x01 = mix(g001, g101, u.x);
    let x11 = mix(g011, g111, u.x);
    return clamp(mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z), -1.0, 1.0);
}
