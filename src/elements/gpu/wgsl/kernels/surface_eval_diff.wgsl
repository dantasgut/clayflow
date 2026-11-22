// Avaliação de uma superfície paramétrica com geometria diferencial (spec 010): o mesmo vértice do `surface_eval`
// (posição, normal, uv por `surface_at`) e, no pool `SurfaceDiff` (a partir de `surface_params.diff_first`), métrica,
// segunda forma, curvaturas e direção principal pelo jato do lugar `surface_jet`. Jato degenerado (polos) usa o de um
// pouco para dentro do domínio em v; o que ainda não for finito fica zero.
// O ponto é o deslocado (`surface_displaced_at`, spec 011); a geometria diferencial é a da superfície sem o deslocamento.
// Requer: structs SurfaceParams, SurfaceDiff; surface_displaced_at; surface_jet; surface_forms (os registros das funções chegam
// com os módulos delas).

@compute @workgroup_size(WORKGROUP_SIZE)
fn surface_eval_diff_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
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
    let data = surface_fn_params(surface_params.record_slot);
    var forms = surface_forms(surface_jet(u, v, time, data));
    if (forms.metric.w == 0.0) {
        let inward = select(-1.0, 1.0, sv < 0.5) * sign(surface_params.v1 - surface_params.v0);
        forms = surface_forms(surface_jet(u, v + inward * surface_params.h_v, time, data));
    }
    surface_diff[surface_params.diff_first + i] = forms;
    let o = i;
    let prev = vec3f(surface_vertices[o].nx, surface_vertices[o].ny, surface_vertices[o].nz);
    let spacing = vec2f(1.0 / f32(max(nu - 1u, 1u)), 1.0 / f32(max(nv - 1u, 1u)));
    let at = surface_displaced_at(u, v, su, sv, spacing, time, data, prev);
    if (!at.finite) { return; }
    surface_vertices[o].px = at.position.x;
    surface_vertices[o].py = at.position.y;
    surface_vertices[o].pz = at.position.z;
    surface_vertices[o].nx = at.normal.x;
    surface_vertices[o].ny = at.normal.y;
    surface_vertices[o].nz = at.normal.z;
    surface_vertices[o].u = su;
    surface_vertices[o].v = sv;
}
