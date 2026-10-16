// Construção de um colisor de superfície (spec 010), passada 1: a superfície avaliada na grade de amostragem nu × nv no
// tempo de cada cópia (cópias em sequência no índice linear; uma por passo fixo do quadro quando anima), pelo mesmo `surface_at` do desenho
// (função da entidade ou pronta, espaço da cena). Grava posição e normal locais e acumula a caixa da cópia com
// atomicMin/atomicMax em ordem total. Amostra não finita fica fora (w = 0).
// Requer: structs SurfaceBakeParams, SurfaceParams; surface_at; surface_collider_common.

@compute @workgroup_size(WORKGROUP_SIZE)
fn scb_points_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let it = scb_item(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, bake.samples);
    let i = it.i;
    let k = it.k;
    if (k >= bake.copies) { return; }
    let iu = i % bake.nu;
    let iv = i / bake.nu;
    let su = f32(iu) / f32(bake.nu - 1u);
    let sv = f32(iv) / f32(bake.nv - 1u);
    let u = mix(surface_params.u0, surface_params.u1, su);
    let v = mix(surface_params.v0, surface_params.v1, sv);
    let data = surface_fn_params(surface_params.record_slot);
    let at = surface_at(u, v, sv, scb_time(k), data, vec3f(0.0, 1.0, 0.0));
    let o = (k * bake.samples + i) * 2u;
    if (!at.finite) {
        bake_points[o] = vec4f(0.0);
        bake_points[o + 1u] = vec4f(0.0);
        return;
    }
    bake_points[o] = vec4f(at.position, 1.0);
    bake_points[o + 1u] = vec4f(at.normal, 0.0);
    let b = k * 8u;
    atomicMin(&bake_bounds[b], scb_order(at.position.x));
    atomicMin(&bake_bounds[b + 1u], scb_order(at.position.y));
    atomicMin(&bake_bounds[b + 2u], scb_order(at.position.z));
    atomicMax(&bake_bounds[b + 4u], scb_order(at.position.x));
    atomicMax(&bake_bounds[b + 5u], scb_order(at.position.y));
    atomicMax(&bake_bounds[b + 6u], scb_order(at.position.z));
}
