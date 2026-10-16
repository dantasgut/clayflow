// Malha adaptativa de uma superfície paramétrica (spec 010): a grade é dividida em P × Q retalhos e cada um ganha um
// nível l (2^l segmentos por lado) pela curvatura (erro de corda κ·h²/8 abaixo da tolerância) e pelo tamanho na tela
// (fração da altura da imagem vista da câmera ativa). Um orçamento de triângulos rebaixa todos os níveis por um viés
// comum. Sem frestas por construção: cada aresta usa o menor nível dos dois retalhos e os vértices de borda acima dele
// colapsam sobre o vértice par anterior — os dois lados avaliam o mesmo (u, v) diádico, o mesmo ponto bit a bit
// (triângulos degenerados são inofensivos). Tudo na GPU, sem leitura de volta: o desenho usa o registro indireto da
// geometria (contagem de índices e de vértices do arame).
//
// Passadas: `surface_adapt_level_main` (um por retalho; histograma dos níveis), `surface_adapt_budget_main` (uma
// thread: o viés), `surface_adapt_scan_main` (um grupo: bases de vértices, índices e arestas por retalho; totais no
// registro indireto) e `surface_adapt_emit_main` (um por vértice possível: vértice, geometria diferencial, índices e
// arestas das células).
// Requer: structs SurfaceParams, SurfaceFnRecord, SpaceFnRecord, SurfaceDiff, SurfaceAdaptParams, CameraMatrices,
// WorldTransform; surface_at; surface_jet; surface_forms; global `space_records`.

const ADAPT_NONE: u32 = NONE;
// Posição do viés no histograma (os níveis ocupam 0..7).
const ADAPT_BIAS: u32 = 15u;

// (u, v) no domínio de um ponto do retalho (pi, qi) em frações (fu, fv) do retalho; (su, sv) normalizados.
struct AdaptUv {
    u: f32,
    v: f32,
    su: f32,
    sv: f32,
}

fn adapt_uv(pi: u32, qi: u32, fu: f32, fv: f32) -> AdaptUv {
    let su = (f32(pi) + fu) / f32(adapt.patches_u);
    let sv = (f32(qi) + fv) / f32(adapt.patches_v);
    return AdaptUv(
        mix(surface_params.u0, surface_params.u1, su),
        mix(surface_params.v0, surface_params.v1, sv),
        su,
        sv,
    );
}

// Geometria diferencial com o recuo dos polos (como na malha uniforme).
fn adapt_forms(uv: AdaptUv, data: SurfaceFnParams) -> SurfaceDiff {
    var forms = surface_forms(surface_jet(uv.u, uv.v, surface_params.time, data));
    if (forms.metric.w == 0.0) {
        let inward = select(-1.0, 1.0, uv.sv < 0.5) * sign(surface_params.v1 - surface_params.v0);
        forms = surface_forms(surface_jet(uv.u, uv.v + inward * surface_params.h_v, surface_params.time, data));
    }
    return forms;
}

// Matriz de mundo da superfície (identidade sem `Transform` ou antes do primeiro quadro).
fn adapt_world() -> mat4x4f {
    let identity = mat4x4f(vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.0, 1.0, 0.0, 0.0), vec4f(0.0, 0.0, 1.0, 0.0), vec4f(0.0, 0.0, 0.0, 1.0));
    if (adapt.transform_slot == ADAPT_NONE) { return identity; }
    let w = adapt_worlds[adapt.transform_slot].world;
    if (w[3][3] == 0.0) { return identity; }
    return w;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn surface_adapt_level_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let idx = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = adapt.patches_u * adapt.patches_v;
    if (idx >= count) { return; }
    var level = adapt.max_level;
    if (adapt.force_max == 0u) {
        let pi = idx % adapt.patches_u;
        let qi = idx / adapt.patches_u;
        let data = surface_fn_params(surface_fn_records[surface_params.record_slot]);
        let up = vec3f(0.0, 1.0, 0.0);
        let t = surface_params.time;
        var kappa = 0.0;
        var corners: array<vec3f, 4>;
        let fus = array<f32, 4>(0.0, 1.0, 0.0, 1.0);
        let fvs = array<f32, 4>(0.0, 0.0, 1.0, 1.0);
        for (var c = 0u; c < 4u; c++) {
            let uv = adapt_uv(pi, qi, fus[c], fvs[c]);
            corners[c] = surface_at(uv.u, uv.v, uv.sv, t, data, up).position;
            let f = adapt_forms(uv, data).curvature;
            kappa = max(kappa, max(abs(f.z), abs(f.w)));
        }
        let mid = adapt_uv(pi, qi, 0.5, 0.5);
        let center = surface_at(mid.u, mid.v, mid.sv, t, data, up).position;
        let fc = adapt_forms(mid, data).curvature;
        kappa = max(kappa, max(abs(fc.z), abs(fc.w)));
        let size = max(
            max(distance(corners[0], corners[1]), distance(corners[2], corners[3])),
            max(distance(corners[0], corners[2]), distance(corners[1], corners[3])),
        );
        let w = adapt_world();
        let scale = max(max(length(w[0].xyz), length(w[1].xyz)), length(w[2].xyz));
        let world_size = size * scale;
        // Erro de corda: n ≥ L·√(κ/(8τ)) com κ em mundo (κ local / escala).
        var n = world_size * sqrt(kappa / max(scale, 1e-12) / (8.0 * max(adapt.tolerance, 1e-9)));
        if (adapt.camera_slot != ADAPT_NONE) {
            let cam = adapt_cameras[adapt.camera_slot];
            let center_world = (w * vec4f(center, 1.0)).xyz;
            let d = max(distance(center_world, cam.position.xyz) - 0.5 * world_size, 1e-3);
            // Fração da altura da imagem que o retalho ocupa: tamanho / distância · cot(fov/2) / 2.
            let fraction = world_size / d * cam.projection[1][1] * 0.5;
            n = max(n, fraction / max(adapt.screen, 1e-6));
        }
        n = max(n, 1.0);
        if (n == n) {
            level = min(u32(ceil(log2(n) - 1e-4)), adapt.max_level);
        }
    }
    adapt_patches[idx] = vec4u(level, 0u, 0u, 0u);
    atomicAdd(&adapt_hist[level], 1u);
}

// Triângulos de um retalho no nível l.
fn adapt_tris(l: u32) -> u32 {
    return 2u << (2u * l);
}

@compute @workgroup_size(1)
fn surface_adapt_budget_main() {
    var bias = 0u;
    if (adapt.force_max == 0u) {
        bias = adapt.max_level;
        for (var b = 0u; b <= adapt.max_level; b++) {
            var total = 0u;
            for (var l = 0u; l <= adapt.max_level; l++) {
                total += atomicLoad(&adapt_hist[l]) * adapt_tris(select(0u, l - b, l > b));
            }
            if (total <= adapt.budget) {
                bias = b;
                break;
            }
        }
    }
    atomicStore(&adapt_hist[ADAPT_BIAS], bias);
}

// Vértices, índices e índices de arestas de um retalho no nível l.
fn adapt_counts(l: u32) -> vec3u {
    let n = 1u << l;
    return vec3u((n + 1u) * (n + 1u), 6u * n * n, 6u * n * n + 4u * n);
}

var<workgroup> adapt_sums: array<vec3u, 256>;

@compute @workgroup_size(256)
fn surface_adapt_scan_main(@builtin(local_invocation_index) t: u32) {
    let count = adapt.patches_u * adapt.patches_v;
    let per = (count + 255u) / 256u;
    let start = t * per;
    let stop = min(start + per, count);
    let bias = atomicLoad(&adapt_hist[ADAPT_BIAS]);
    var own = vec3u(0u);
    for (var i = start; i < stop; i++) {
        let l = adapt_patches[i].x;
        own += adapt_counts(select(0u, l - bias, l > bias));
    }
    adapt_sums[t] = own;
    workgroupBarrier();
    // Soma de prefixos (Hillis-Steele) inclusiva sobre as 256 somas.
    for (var offset = 1u; offset < 256u; offset = offset << 1u) {
        var add = vec3u(0u);
        if (t >= offset) { add = adapt_sums[t - offset]; }
        workgroupBarrier();
        adapt_sums[t] += add;
        workgroupBarrier();
    }
    var base = adapt_sums[t] - own;
    for (var i = start; i < stop; i++) {
        let l = adapt_patches[i].x;
        let le = select(0u, l - bias, l > bias);
        adapt_patches[i] = vec4u(le, base.x, base.y, base.z);
        base += adapt_counts(le);
    }
    if (t == 255u) {
        let total = adapt_sums[255];
        // Indexado: contagem, instâncias, primeiro índice, vértice base, primeira instância.
        adapt_draw[0] = total.y;
        adapt_draw[1] = 1u;
        adapt_draw[2] = 0u;
        adapt_draw[3] = 0u;
        adapt_draw[4] = 0u;
        // Arame (não indexado): um quad (6 vértices) por aresta.
        adapt_draw[5] = 3u * total.z;
        adapt_draw[6] = 1u;
        adapt_draw[7] = 0u;
        adapt_draw[8] = 0u;
        adapt_draw[9] = 0u;
    }
}

// Nível do retalho vizinho (com volta nos domínios periódicos); fora do domínio, o próprio.
fn adapt_neighbor(pi: i32, qi: i32, own: u32) -> u32 {
    var p = pi;
    var q = qi;
    let pu = i32(adapt.patches_u);
    let pv = i32(adapt.patches_v);
    if (p < 0 || p >= pu) {
        if (adapt.periodic_u == 0u) { return own; }
        p = (p + pu) % pu;
    }
    if (q < 0 || q >= pv) {
        if (adapt.periodic_v == 0u) { return own; }
        q = (q + pv) % pv;
    }
    return adapt_patches[u32(q) * adapt.patches_u + u32(p)].x;
}

// Índice colapsado sobre o múltiplo de 2^(l − e) anterior (aresta de nível e < l).
fn adapt_snap(i: u32, l: u32, e: u32) -> u32 {
    let s = 1u << (l - min(l, e));
    return (i / s) * s;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn surface_adapt_emit_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let idx = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let side = adapt.side;
    let pid = idx / (side * side);
    if (pid >= adapt.patches_u * adapt.patches_v) { return; }
    let cell_local = idx % (side * side);
    let j = cell_local % side;
    let k = cell_local / side;
    let pd = adapt_patches[pid];
    let l = pd.x;
    let n = 1u << l;
    if (j > n || k > n) { return; }
    let pi = pid % adapt.patches_u;
    let qi = pid / adapt.patches_u;
    var jj = j;
    var kk = k;
    if (k == 0u) { jj = adapt_snap(jj, l, adapt_neighbor(i32(pi), i32(qi) - 1, l)); }
    if (k == n) { jj = adapt_snap(jj, l, adapt_neighbor(i32(pi), i32(qi) + 1, l)); }
    if (j == 0u) { kk = adapt_snap(kk, l, adapt_neighbor(i32(pi) - 1, i32(qi), l)); }
    if (j == n) { kk = adapt_snap(kk, l, adapt_neighbor(i32(pi) + 1, i32(qi), l)); }
    let uv = adapt_uv(pi, qi, f32(jj) / f32(n), f32(kk) / f32(n));
    let data = surface_fn_params(surface_fn_records[surface_params.record_slot]);
    let vi = pd.y + k * (n + 1u) + j;
    let o = vi;
    let prev = vec3f(adapt_vertices[o].nx, adapt_vertices[o].ny, adapt_vertices[o].nz);
    let at = surface_at(uv.u, uv.v, uv.sv, surface_params.time, data, select(prev, vec3f(0.0, 1.0, 0.0), dot(prev, prev) == 0.0));
    if (at.finite) {
        adapt_vertices[o].px = at.position.x;
        adapt_vertices[o].py = at.position.y;
        adapt_vertices[o].pz = at.position.z;
        adapt_vertices[o].nx = at.normal.x;
        adapt_vertices[o].ny = at.normal.y;
        adapt_vertices[o].nz = at.normal.z;
        adapt_vertices[o].u = uv.su;
        adapt_vertices[o].v = uv.sv;
    }
    surface_diff[adapt.diff_first + vi] = adapt_forms(uv, data);
    if (j < n && k < n) {
        let a = vi;
        let b = a + 1u;
        let c = a + n + 1u;
        let d = c + 1u;
        let cell = k * n + j;
        let ib = pd.z + 6u * cell;
        adapt_indices[ib] = a;
        adapt_indices[ib + 1u] = b;
        adapt_indices[ib + 2u] = c;
        adapt_indices[ib + 3u] = b;
        adapt_indices[ib + 4u] = d;
        adapt_indices[ib + 5u] = c;
        let eb = pd.w + 6u * cell;
        adapt_edges[eb] = a;
        adapt_edges[eb + 1u] = b;
        adapt_edges[eb + 2u] = a;
        adapt_edges[eb + 3u] = c;
        adapt_edges[eb + 4u] = b;
        adapt_edges[eb + 5u] = c;
        let extra = pd.w + 6u * n * n;
        if (k == n - 1u) {
            adapt_edges[extra + 2u * j] = c;
            adapt_edges[extra + 2u * j + 1u] = d;
        }
        if (j == n - 1u) {
            adapt_edges[extra + 2u * n + 2u * k] = b;
            adapt_edges[extra + 2u * n + 2u * k + 1u] = d;
        }
    }
}
