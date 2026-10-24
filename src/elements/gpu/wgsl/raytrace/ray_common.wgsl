// Estrutura de raios (spec 033, R1): constantes e funções comuns à construção e à consulta — tipos de primitiva, a
// marca de folha dos nós, código de Morton de 30 bits, codificação ordenada de floats (mínimo e máximo atômicos) e as
// interseções raio–caixa (lâminas), raio–triângulo (Möller–Trumbore, dos dois lados) e raio–esfera. A referência de CPU
// é `elements/raytrace/reference/bvh.ts`.
// Requer: NONE.

/** Bit da folha no filho esquerdo de um nó (`lo.w`). */
const RAY_LEAF: u32 = 0x80000000u;
/** Hierarquia de triângulos (malhas, superfícies, grafos). */
const RAY_KIND_TRIANGLES: u32 = 0u;
/** Hierarquia de esferas (partículas de sprite). */
const RAY_KIND_SPHERES: u32 = 1u;
/** Volume de campo (fluido por campo de distância, meio participante). */
const RAY_KIND_VOLUME: u32 = 2u;
/** Palavras `vec4u` por elemento nos pools da estrutura (os `RAY_WORDS` do TypeScript). */
const RAY_VERTEX_WORDS: u32 = 2u;
const RAY_TRIANGLE_WORDS: u32 = 1u;
const RAY_SPHERE_WORDS: u32 = 1u;
const RAY_NODE_WORDS: u32 = 2u;
const RAY_BLAS_WORDS: u32 = 2u;
const RAY_INSTANCE_WORDS: u32 = 11u;
/** Distância de "sem acerto". */
const RAY_MISS: f32 = 3.0e38;

/** Espalha os 10 bits baixos a cada 3 bits. */
fn ray_expand_bits(v: u32) -> u32 {
    var x = v & 0x3FFu;
    x = (x * 0x00010001u) & 0xFF0000FFu;
    x = (x * 0x00000101u) & 0x0F00F00Fu;
    x = (x * 0x00000011u) & 0xC30C30C3u;
    x = (x * 0x00000005u) & 0x49249249u;
    return x;
}

/** Código de Morton de 30 bits de um ponto normalizado em [0, 1]³ (x no bit mais alto de cada trio). */
fn ray_morton(p: vec3f) -> u32 {
    let q = vec3u(clamp(floor(p * 1024.0), vec3f(0.0), vec3f(1023.0)));
    return (ray_expand_bits(q.x) << 2u) | (ray_expand_bits(q.y) << 1u) | ray_expand_bits(q.z);
}

/** Float → u32 com a mesma ordem (para `atomicMin`/`atomicMax`). */
fn ray_order_f32(x: f32) -> u32 {
    let b = bitcast<u32>(x);
    return select(b ^ 0x80000000u, ~b, (b & 0x80000000u) != 0u);
}

/** Inverso de `ray_order_f32`. */
fn ray_unorder_f32(u: u32) -> f32 {
    return bitcast<f32>(select(~u, u ^ 0x80000000u, (u & 0x80000000u) != 0u));
}

/** Entrada do raio na caixa em [0, t_max], ou `RAY_MISS`. */
fn ray_box(origin: vec3f, inv_dir: vec3f, lo: vec3f, hi: vec3f, t_max: f32) -> f32 {
    let a = (lo - origin) * inv_dir;
    let b = (hi - origin) * inv_dir;
    let t0 = max(max(min(a.x, b.x), min(a.y, b.y)), max(min(a.z, b.z), 0.0));
    let t1 = min(min(max(a.x, b.x), max(a.y, b.y)), min(max(a.z, b.z), t_max));
    return select(RAY_MISS, t0, t0 <= t1);
}

/** Nó da hierarquia: caixas e filhos (na folha: `RAY_LEAF` | posição, primeira primitiva). */
struct RayNode {
    lo: vec3f,
    left: u32,
    hi: vec3f,
    right: u32,
}

/** Nó das duas palavras `a`, `b`. */
fn ray_node_words(a: vec4u, b: vec4u) -> RayNode {
    return RayNode(bitcast<vec3f>(a.xyz), a.w, bitcast<vec3f>(b.xyz), b.w);
}

/** Raio–triângulo dos dois lados: (t, u, v) com t > 0 e < t_max, ou t = `RAY_MISS`. */
fn ray_triangle(origin: vec3f, dir: vec3f, a: vec3f, b: vec3f, c: vec3f, t_max: f32) -> vec3f {
    let e1 = b - a;
    let e2 = c - a;
    let p = cross(dir, e2);
    let det = dot(e1, p);
    if (abs(det) < 1e-20) { return vec3f(RAY_MISS, 0.0, 0.0); }
    let inv = 1.0 / det;
    let s = origin - a;
    let u = dot(s, p) * inv;
    let q = cross(s, e1);
    let v = dot(dir, q) * inv;
    let t = dot(e2, q) * inv;
    let inside = u >= 0.0 && v >= 0.0 && u + v <= 1.0 && t > 0.0 && t < t_max;
    return select(vec3f(RAY_MISS, 0.0, 0.0), vec3f(t, u, v), inside);
}

/** Raio–esfera: a primeira distância positiva < t_max, ou `RAY_MISS` (direção não necessariamente unitária). */
fn ray_sphere(origin: vec3f, dir: vec3f, center: vec3f, radius: f32, t_max: f32) -> f32 {
    let oc = origin - center;
    let a = dot(dir, dir);
    let b = dot(oc, dir);
    let c = dot(oc, oc) - radius * radius;
    let disc = b * b - a * c;
    if (disc < 0.0) { return RAY_MISS; }
    let s = sqrt(disc);
    let t0 = (-b - s) / a;
    let t1 = (-b + s) / a;
    if (t0 > 0.0 && t0 < t_max) { return t0; }
    if (t1 > 0.0 && t1 < t_max) { return t1; }
    return RAY_MISS;
}
