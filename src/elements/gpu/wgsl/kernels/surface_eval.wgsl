// Avaliação de uma superfície paramétrica numa grade nu × nv (spec 009): para cada vértice (iu, iv), (u, v) no
// domínio, a posição por `surface_fn`, as tangentes por `surface_tangents` (analíticas ou por diferenças) e a normal
// du × dv; depois o espaço (`space_map`/`space_normal`, identidade sem `SpaceFunction`). Escreve posição, normal e (u, v)
// no vertex buffer da geometria. Ponto ou normal não finitos mantêm o vértice anterior; tangentes degeneradas (polos)
// usam as de um pouco para dentro do domínio em v.
// Requer: structs SurfaceParams, SurfaceFnRecord, SpaceFnRecord; surface_fn (ponto); surface_tangents; space (ponto);
// global `space_records`.

@group(0) @binding(0) var<uniform>             surface_params:  SurfaceParams;
@group(0) @binding(1) var<storage, read_write> surface_vertices: array<f32>;
@group(0) @binding(2) var<storage, read>       surface_fn_records: array<SurfaceFnRecord>;
@group(0) @binding(3) var<storage, read>       space_records: array<SpaceFnRecord>;

fn surface_finite(v: vec3f) -> bool {
    return all(v == v) && all(abs(v) < vec3f(3.4e38));
}

@compute @workgroup_size(64)
fn surface_eval_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * 64u;
    let nu = surface_params.nu;
    let nv = surface_params.nv;
    if (i >= nu * nv) { return; }
    let iu = i % nu;
    let iv = i / nu;
    let su = f32(iu) / f32(max(nu - 1u, 1u));
    let sv = f32(iv) / f32(max(nv - 1u, 1u));
    let u = mix(surface_params.u0, surface_params.u1, su);
    let v = mix(surface_params.v0, surface_params.v1, sv);
    let time = surface_params.time;
    let data = surface_fn_params(surface_fn_records[surface_params.record_slot]);
    let p = surface_fn(u, v, time, data);
    let t = surface_tangents(u, v, time, data);
    let o = i * 8u;
    var raw = cross(t[0], t[1]);
    // Tangentes degeneradas (polo: uma delas some diante da outra — em f32 com o sinal do resto da conta): as de um
    // pouco para dentro do domínio em v.
    let lu = length(t[0]);
    let lv = length(t[1]);
    if (min(lu, lv) <= 1e-4 * max(lu, lv) || length(raw) <= 1e-12) {
        let inward = select(-1.0, 1.0, sv < 0.5) * sign(surface_params.v1 - surface_params.v0);
        let t2 = surface_tangents(u, v + inward * surface_params.h_v, time, data);
        raw = cross(t2[0], t2[1]);
    }
    let len = length(raw);
    var n = vec3f(surface_vertices[o + 3u], surface_vertices[o + 4u], surface_vertices[o + 5u]);
    if (len > 1e-12 && surface_finite(raw)) { n = raw / len; }
    let x = space_map(p, time);
    let m = space_normal(p, time, n);
    if (!surface_finite(x) || !surface_finite(m)) { return; }
    surface_vertices[o] = x.x;
    surface_vertices[o + 1u] = x.y;
    surface_vertices[o + 2u] = x.z;
    surface_vertices[o + 3u] = m.x;
    surface_vertices[o + 4u] = m.y;
    surface_vertices[o + 5u] = m.z;
    surface_vertices[o + 6u] = su;
    surface_vertices[o + 7u] = sv;
}
