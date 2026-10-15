// Avaliação de uma superfície paramétrica numa grade nu × nv (spec 009): para cada vértice (iu, iv), (u, v) no
// domínio, a posição por `surface_fn`, as tangentes por `surface_tangents` (analíticas ou por diferenças) e a normal
// du × dv; depois o espaço (`space_map`/`space_normal`, identidade sem `SpaceFunction`). Escreve posição, normal e (u, v)
// no vertex buffer da geometria. Ponto ou normal não finitos mantêm o vértice anterior; tangentes degeneradas (polos)
// usam as de um pouco para dentro do domínio em v.
// Requer: structs SurfaceParams, SurfaceFnRecord, SpaceFnRecord; surface_at (com os pontos surface, surface_tangents e
// space); global `space_records`.

@group(0) @binding(0) var<uniform>             surface_params:  SurfaceParams;
@group(0) @binding(1) var<storage, read_write> surface_vertices: array<f32>;
@group(0) @binding(2) var<storage, read>       surface_fn_records: array<SurfaceFnRecord>;
@group(0) @binding(3) var<storage, read>       space_records: array<SpaceFnRecord>;

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
    let o = i * 8u;
    let prev = vec3f(surface_vertices[o + 3u], surface_vertices[o + 4u], surface_vertices[o + 5u]);
    let at = surface_at(u, v, sv, time, data, prev);
    if (!at.finite) { return; }
    let x = at.position;
    let m = at.normal;
    surface_vertices[o] = x.x;
    surface_vertices[o + 1u] = x.y;
    surface_vertices[o + 2u] = x.z;
    surface_vertices[o + 3u] = m.x;
    surface_vertices[o + 4u] = m.y;
    surface_vertices[o + 5u] = m.z;
    surface_vertices[o + 6u] = su;
    surface_vertices[o + 7u] = sv;
}
