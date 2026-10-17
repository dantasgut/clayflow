// Sondas da iluminação global (spec 033, R2/R6): mapeamento octaédrico das direções, endereçamento das sondas nas
// cascatas (circular: a célula de mundo de uma sonda é a que tem o seu índice módulo a grade, então a grade acompanha a
// câmera sem perder o histórico das sondas que continuam), posição de mundo (com o deslocamento da relocação),
// coordenadas no atlas dos mapas e a espiral de Fibonacci dos raios.
// Requer: gi (os parâmetros).

const GI_PI: f32 = 3.14159265358979;
/** Texels por lado dos mapas de irradiância/radiância e de visibilidade (sem a borda). */
const GI_IRRADIANCE_TEXELS: u32 = 8u;
const GI_VISIBILITY_TEXELS: u32 = 16u;
/** Sondas por linha da textura das sondas (duas texels por sonda). */
const GI_PROBE_TEXTURE_ROW: u32 = 128u;
/** Módulo da célula guardada na textura das sondas (inteiros exatos em meio-float). */
const GI_CELL_WRAP: i32 = 2048;
/** Estados de sonda. */
const GI_PROBE_ACTIVE: f32 = 0.0;
const GI_PROBE_INSIDE: f32 = 1.0;
const GI_PROBE_NEW: f32 = 2.0;

fn gi_sign_not_zero(v: vec2f) -> vec2f {
    return select(vec2f(-1.0), vec2f(1.0), v >= vec2f(0.0));
}

/** Direção unitária → [-1, 1]² (octaedro). */
fn gi_oct_encode(n: vec3f) -> vec2f {
    let l1 = abs(n.x) + abs(n.y) + abs(n.z);
    var p = n.xy / l1;
    if (n.z < 0.0) { p = (1.0 - abs(p.yx)) * gi_sign_not_zero(p); }
    return p;
}

/** [-1, 1]² → direção unitária. */
fn gi_oct_decode(p: vec2f) -> vec3f {
    var n = vec3f(p, 1.0 - abs(p.x) - abs(p.y));
    if (n.z < 0.0) {
        let xy = (1.0 - abs(n.yx)) * gi_sign_not_zero(n.xy);
        n = vec3f(xy, n.z);
    }
    return normalize(n);
}

/** Direção do centro do texel (i, j) de um mapa de `size` × `size`. */
fn gi_texel_dir(texel: vec2u, size: u32) -> vec3f {
    return gi_oct_decode((vec2f(texel) + 0.5) / f32(size) * 2.0 - 1.0);
}

/** Sondas por cascata. */
fn gi_cascade_probes() -> u32 {
    return gi.grid.x * gi.grid.y * gi.grid.z;
}

/** Sondas em todas as cascatas ativas. */
fn gi_probe_count() -> u32 {
    return gi_cascade_probes() * gi.grid.w;
}

/** Canto (célula de mundo do índice 0, xyz) e espaçamento (w) da cascata. */
fn gi_cascade(c: u32) -> vec4f {
    switch (c) {
        case 0u: { return gi.cascade0; }
        case 1u: { return gi.cascade1; }
        case 2u: { return gi.cascade2; }
        default: { return gi.cascade3; }
    }
}

/** Índice local na grade (x, y, z) de uma sonda e a cascata. */
fn gi_probe_local(index: u32) -> vec4u {
    let per = gi_cascade_probes();
    let c = index / per;
    let i = index % per;
    let gx = gi.grid.x;
    let gy = gi.grid.y;
    return vec4u(i % gx, (i / gx) % gy, i / (gx * gy), c);
}

/** Índice de uma sonda pela posição local na grade e a cascata. */
fn gi_probe_index(local: vec3u, c: u32) -> u32 {
    return c * gi_cascade_probes() + local.x + local.y * gi.grid.x + local.z * gi.grid.x * gi.grid.y;
}

fn gi_mod(a: vec3i, m: vec3i) -> vec3i {
    return ((a % m) + m) % m;
}

/** Célula reduzida ao módulo da textura das sondas (a grade nunca abrange células que diferem desse módulo). */
fn gi_cell_wrap(cell: vec3i) -> vec3i {
    return ((cell % GI_CELL_WRAP) + GI_CELL_WRAP) % GI_CELL_WRAP;
}

/** Célula de mundo de uma sonda (endereçamento circular a partir do canto da cascata). */
fn gi_probe_cell(index: u32) -> vec3i {
    let l = gi_probe_local(index);
    let base = vec3i(floor(gi_cascade(l.w).xyz));
    let dims = vec3i(gi.grid.xyz);
    return base + gi_mod(vec3i(l.xyz) - base, dims);
}

/**
 * Posição de mundo da célula de uma sonda (sem o deslocamento): o centro da célula — sondas fora dos planos de
 * múltiplos inteiros do espaçamento, onde as cenas costumam ter chão e paredes.
 */
fn gi_cell_position(cell: vec3i, c: u32) -> vec3f {
    return (vec3f(cell) + 0.5) * gi_cascade(c).w;
}

/** Coordenada contínua de grade de um ponto na cascata (a sonda da célula k fica em k). */
fn gi_grid_coord(p: vec3f, c: u32) -> vec3f {
    return p / gi_cascade(c).w - 0.5;
}

/** Posição local (índice na grade) de uma célula de mundo da cascata. */
fn gi_cell_local(cell: vec3i) -> vec3u {
    return vec3u(gi_mod(cell, vec3i(gi.grid.xyz)));
}

/** Origem do ladrilho de uma sonda no atlas (o texel da borda superior esquerda). */
fn gi_atlas_tile(index: u32, texels: u32) -> vec2u {
    let l = gi_probe_local(index);
    let tile = texels + 2u;
    return vec2u((l.x + l.z * gi.grid.x) * tile, (l.y + l.w * gi.grid.y) * tile);
}

/** uv no atlas de `atlas_size` para a direção `dir` no mapa da sonda. */
fn gi_atlas_uv(index: u32, dir: vec3f, texels: u32, atlas_size: vec2f) -> vec2f {
    let o = gi_oct_encode(normalize(dir)) * 0.5 + 0.5;
    let tex = vec2f(gi_atlas_tile(index, texels)) + 1.0 + o * f32(texels);
    return tex / atlas_size;
}

/** Direção k de n na espiral de Fibonacci esférica. */
fn gi_fibonacci(k: u32, n: u32) -> vec3f {
    let golden = 2.39996322972865;
    let z = 1.0 - (2.0 * f32(k) + 1.0) / f32(n);
    let r = sqrt(max(0.0, 1.0 - z * z));
    let phi = f32(k) * golden;
    return vec3f(r * cos(phi), r * sin(phi), z);
}

/** Direção do raio `k` da sonda neste quadro (a espiral girada pela rotação do quadro). */
fn gi_ray_dir(k: u32) -> vec3f {
    let d = gi_fibonacci(k, gi.rays.x);
    return normalize(mat3x3f(gi.rotation0.xyz, gi.rotation1.xyz, gi.rotation2.xyz) * d);
}
