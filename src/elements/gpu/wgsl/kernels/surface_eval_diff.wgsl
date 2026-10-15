// Avaliação de uma superfície paramétrica com geometria diferencial (spec 010): o mesmo vértice do `surface_eval`
// (posição, normal, uv por `surface_at`) e, no pool `SurfaceDiff` (a partir de `surface_params.diff_first`), métrica,
// segunda forma, curvaturas e direção principal pelo jato do lugar `surface_jet`. Jato degenerado (polos) usa o de um
// pouco para dentro do domínio em v; o que ainda não for finito fica zero.
// Requer: structs SurfaceParams, SurfaceFnRecord, SpaceFnRecord, SurfaceDiff; surface_at; surface_jet; surface_forms;
// global `space_records`.

@group(0) @binding(0) var<uniform>             surface_params:  SurfaceParams;
@group(0) @binding(1) var<storage, read_write> surface_vertices: array<f32>;
@group(0) @binding(2) var<storage, read>       surface_fn_records: array<SurfaceFnRecord>;
@group(0) @binding(3) var<storage, read>       space_records: array<SpaceFnRecord>;
@group(0) @binding(4) var<storage, read_write> surface_diff: array<SurfaceDiff>;

@compute @workgroup_size(64)
fn surface_eval_diff_main(
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
    var forms = surface_forms(surface_jet(u, v, time, data));
    if (forms.metric.w == 0.0) {
        let inward = select(-1.0, 1.0, sv < 0.5) * sign(surface_params.v1 - surface_params.v0);
        forms = surface_forms(surface_jet(u, v + inward * surface_params.h_v, time, data));
    }
    surface_diff[surface_params.diff_first + i] = forms;
    let o = i * 8u;
    let prev = vec3f(surface_vertices[o + 3u], surface_vertices[o + 4u], surface_vertices[o + 5u]);
    let at = surface_at(u, v, sv, time, data, prev);
    if (!at.finite) { return; }
    surface_vertices[o] = at.position.x;
    surface_vertices[o + 1u] = at.position.y;
    surface_vertices[o + 2u] = at.position.z;
    surface_vertices[o + 3u] = at.normal.x;
    surface_vertices[o + 4u] = at.normal.y;
    surface_vertices[o + 5u] = at.normal.z;
    surface_vertices[o + 6u] = su;
    surface_vertices[o + 7u] = sv;
}
