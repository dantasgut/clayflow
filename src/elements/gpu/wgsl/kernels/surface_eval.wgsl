// Avaliação de uma superfície paramétrica numa grade nu × nv (spec 009): para cada vértice (iu, iv), (u, v) no
// domínio, a posição por `surface_fn`, as tangentes por `surface_tangents` (analíticas ou por diferenças) e a normal
// du × dv; depois o espaço (`space_map`/`space_normal`, identidade sem `SpaceFunction`). Escreve posição, normal e (u, v)
// no vertex buffer da geometria. Ponto ou normal não finitos mantêm o vértice anterior; tangentes degeneradas (polos)
// usam as de um pouco para dentro do domínio em v.
// O ponto é o deslocado (`surface_displaced_at`, spec 011: igual ao de `surface_at` sem `DisplacementFunction`).
// Requer: struct SurfaceParams; surface_displaced_at (com os pontos surface, surface_tangents e space; os registros das funções
// chegam com os módulos delas).

@compute @workgroup_size(WORKGROUP_SIZE)
fn surface_eval_main(
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
    let o = i;
    let prev = vec3f(surface_vertices[o].nx, surface_vertices[o].ny, surface_vertices[o].nz);
    let spacing = vec2f(1.0 / f32(max(nu - 1u, 1u)), 1.0 / f32(max(nv - 1u, 1u)));
    let at = surface_displaced_at(u, v, su, sv, spacing, time, data, prev);
    if (!at.finite) { return; }
    let x = at.position;
    let m = at.normal;
    surface_vertices[o].px = x.x;
    surface_vertices[o].py = x.y;
    surface_vertices[o].pz = x.z;
    surface_vertices[o].nx = m.x;
    surface_vertices[o].ny = m.y;
    surface_vertices[o].nz = m.z;
    surface_vertices[o].u = su;
    surface_vertices[o].v = sv;
}
