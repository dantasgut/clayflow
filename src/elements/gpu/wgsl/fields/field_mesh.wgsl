// A malha da superfície da água (spec 039 refeita, D3): por bloco ocupado do campo (um grupo por bloco), as 8³ células
// entre os centros dos voxels (a borda do bloco dá os vizinhos sem busca), cada uma em 6 tetraedros em volta da diagonal
// 0–7; o nível zero de φ em cada tetraedro vira 1 triângulo (1 ou 3 cantos dentro) ou 2 (2 dentro), com a normal pelo
// gradiente de φ nos cantos (diferenças centrais), interpolada na aresta. Os triângulos vão para `field_mesh` (3 vértices
// cada, sem índice: a posição e a normal octaédrica em 16 bytes) por uma contagem atômica; o que passa da capacidade
// conta mas não é gravado (a contagem diz o estouro). `field_mesh_args_main` escreve os argumentos do desenho indireto.
// Requer: WORKGROUP_SIZE, NONE, fluid_field, field_common, field_counts, field_lookup, field_mesh, field_mesh_args.

/** Palavras por vértice da malha (a posição e a normal octaédrica). */
const FIELD_MESH_VERTEX_WORDS: u32 = 4u;
/** As palavras dos argumentos: o desenho indireto (4) e a contagem dos triângulos (4). */
const FIELD_MESH_COUNT_WORD: u32 = 4u;

/** Os cantos de uma célula (a ordem dos bits: x, y, z) e os 6 tetraedros em volta da diagonal 0–7. */
const FIELD_MESH_TETS = array<vec4u, 6>(
    vec4u(0u, 1u, 3u, 7u),
    vec4u(0u, 3u, 2u, 7u),
    vec4u(0u, 2u, 6u, 7u),
    vec4u(0u, 6u, 4u, 7u),
    vec4u(0u, 4u, 5u, 7u),
    vec4u(0u, 5u, 1u, 7u),
);

/** A normal unitária `n` em 32 bits (octaédrica, 16 bits por eixo). */
fn field_mesh_pack_normal(n: vec3f) -> u32 {
    var o = n.xy / max(abs(n.x) + abs(n.y) + abs(n.z), 1e-12);
    if (n.z < 0.0) { o = (vec2f(1.0) - abs(o.yx)) * select(vec2f(-1.0), vec2f(1.0), o >= vec2f(0.0)); }
    return pack2x16snorm(o);
}

/** A normal de 32 bits de `field_mesh_pack_normal`. */
fn field_mesh_unpack_normal(w: u32) -> vec3f {
    let o = unpack2x16snorm(w);
    var n = vec3f(o, 1.0 - abs(o.x) - abs(o.y));
    if (n.z < 0.0) { n = vec3f((vec2f(1.0) - abs(n.yx)) * select(vec2f(-1.0), vec2f(1.0), n.xy >= vec2f(0.0)), n.z); }
    return normalize(n);
}

/** φ do voxel `v` (de −2 a 9) do bloco `brick`. */
fn field_mesh_phi(brick: u32, v: vec3i) -> f32 {
    return field_voxel_value(field_apron_at(brick, v));
}

/** O gradiente de φ no voxel `v` (de −1 a 8) do bloco `brick`, por diferenças centrais. */
fn field_mesh_gradient(brick: u32, v: vec3i) -> vec3f {
    return vec3f(
        field_mesh_phi(brick, v + vec3i(1, 0, 0)) - field_mesh_phi(brick, v - vec3i(1, 0, 0)),
        field_mesh_phi(brick, v + vec3i(0, 1, 0)) - field_mesh_phi(brick, v - vec3i(0, 1, 0)),
        field_mesh_phi(brick, v + vec3i(0, 0, 1)) - field_mesh_phi(brick, v - vec3i(0, 0, 1)),
    );
}

/** O vértice no nível zero da aresta entre os cantos `a` e `b` (posição em xyz, φ em w) e os gradientes deles. */
fn field_mesh_edge(a: vec4f, b: vec4f, ga: vec3f, gb: vec3f) -> array<vec3f, 2> {
    let s = clamp(a.w / (a.w - b.w), 0.0, 1.0);
    return array<vec3f, 2>(mix(a.xyz, b.xyz, s), mix(ga, gb, s));
}

/** Grava o triângulo (p0, p1, p2) com as normais, virado para fora (a normal média para o lado de φ maior). */
fn field_mesh_emit(p: array<vec3f, 3>, n: array<vec3f, 3>) {
    let k = atomicAdd(&field_mesh_args[FIELD_MESH_COUNT_WORD], 1u);
    let capacity = arrayLength(&field_mesh) / (3u * FIELD_MESH_VERTEX_WORDS);
    if (k >= capacity) { return; }
    let face = cross(p[1] - p[0], p[2] - p[0]);
    let flip = dot(face, n[0] + n[1] + n[2]) < 0.0;
    for (var c = 0u; c < 3u; c++) {
        let src = select(c, 2u - c, flip);
        let w = (3u * k + c) * FIELD_MESH_VERTEX_WORDS;
        field_mesh[w] = bitcast<u32>(p[src].x);
        field_mesh[w + 1u] = bitcast<u32>(p[src].y);
        field_mesh[w + 2u] = bitcast<u32>(p[src].z);
        let len = length(n[src]);
        field_mesh[w + 3u] = field_mesh_pack_normal(select(vec3f(0.0, 1.0, 0.0), n[src] / len, len > 1e-12));
    }
}

/** O nível zero no tetraedro de cantos `c` (posição e φ) e gradientes `g`. */
fn field_mesh_tet(c: array<vec4f, 4>, g: array<vec3f, 4>) {
    var inside = 0u;
    for (var k = 0u; k < 4u; k++) { if (c[k].w < 0.0) { inside |= 1u << k; } }
    let count = countOneBits(inside);
    if (count == 0u || count == 4u) { return; }
    // Os cantos de um lado (o que tem 1 ou 2) e do outro.
    var a: array<u32, 4>;
    var na = 0u;
    var nb = 0u;
    var b: array<u32, 4>;
    let lone_inside = count == 1u;
    for (var k = 0u; k < 4u; k++) {
        let is_in = (inside & (1u << k)) != 0u;
        if (is_in == (lone_inside || count == 2u)) {
            a[na] = k;
            na++;
        } else {
            b[nb] = k;
            nb++;
        }
    }
    if (na == 1u || nb == 1u) {
        // Um canto sozinho de um lado: um triângulo nas três arestas dele.
        let lone = select(b[0], a[0], na == 1u);
        var p: array<vec3f, 3>;
        var n: array<vec3f, 3>;
        var m = 0u;
        for (var k = 0u; k < 4u; k++) {
            if (k == lone) { continue; }
            let e = field_mesh_edge(c[lone], c[k], g[lone], g[k]);
            p[m] = e[0];
            n[m] = e[1];
            m++;
        }
        field_mesh_emit(p, n);
        return;
    }
    // Dois de cada lado: um quadrilátero nas quatro arestas entre os lados (a0b0, a0b1, a1b1, a1b0), dois triângulos.
    let e00 = field_mesh_edge(c[a[0]], c[b[0]], g[a[0]], g[b[0]]);
    let e01 = field_mesh_edge(c[a[0]], c[b[1]], g[a[0]], g[b[1]]);
    let e11 = field_mesh_edge(c[a[1]], c[b[1]], g[a[1]], g[b[1]]);
    let e10 = field_mesh_edge(c[a[1]], c[b[0]], g[a[1]], g[b[0]]);
    field_mesh_emit(array<vec3f, 3>(e00[0], e01[0], e11[0]), array<vec3f, 3>(e00[1], e01[1], e11[1]));
    field_mesh_emit(array<vec3f, 3>(e00[0], e11[0], e10[0]), array<vec3f, 3>(e00[1], e11[1], e10[1]));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_mesh_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let brick = wid.x + wid.y * nwg.x;
    if (brick >= min(field_counts[0].count, fluid_field.sizes.y)) { return; }
    let b = field_brick_at(brick).xyz;
    let voxel = field_voxel();
    for (var cell = lid; cell < FIELD_BRICK_VOXELS; cell += WORKGROUP_SIZE) {
        let v0 = vec3i(i32(cell % 8u), i32((cell / 8u) % 8u), i32(cell / 64u));
        var c: array<vec4f, 8>;
        var any_in = false;
        var any_out = false;
        for (var k = 0u; k < 8u; k++) {
            let v = v0 + vec3i(i32(k & 1u), i32((k >> 1u) & 1u), i32(k >> 2u));
            let phi = field_mesh_phi(brick, v);
            c[k] = vec4f((vec3f(b * FIELD_BRICK + v) + 0.5) * voxel, phi);
            any_in = any_in || phi < 0.0;
            any_out = any_out || phi >= 0.0;
        }
        if (!(any_in && any_out)) { continue; }
        var g: array<vec3f, 8>;
        for (var k = 0u; k < 8u; k++) {
            g[k] = field_mesh_gradient(brick, v0 + vec3i(i32(k & 1u), i32((k >> 1u) & 1u), i32(k >> 2u)));
        }
        for (var t = 0u; t < 6u; t++) {
            let q = FIELD_MESH_TETS[t];
            field_mesh_tet(array<vec4f, 4>(c[q.x], c[q.y], c[q.z], c[q.w]),
                array<vec3f, 4>(g[q.x], g[q.y], g[q.z], g[q.w]));
        }
    }
}

/** Os argumentos do desenho indireto: os vértices dos triângulos gravados (até a capacidade), uma instância. */
@compute @workgroup_size(1)
fn field_mesh_args_main() {
    let capacity = arrayLength(&field_mesh) / (3u * FIELD_MESH_VERTEX_WORDS);
    let triangles = min(atomicLoad(&field_mesh_args[FIELD_MESH_COUNT_WORD]), capacity);
    atomicStore(&field_mesh_args[0], 3u * triangles);
    atomicStore(&field_mesh_args[1], 1u);
    atomicStore(&field_mesh_args[2], 0u);
    atomicStore(&field_mesh_args[3], 0u);
}
