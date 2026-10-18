// Caixa do conjunto reduzida no grupo de trabalho (spec 033, R1): cada invocação entra com a caixa da sua primitiva
// (vazia fora do conjunto), o grupo reduz em memória compartilhada e só a primeira invocação acumula na caixa do
// conjunto (`ray_bounds[build.slot]`) por máximos atômicos — o mínimo como o máximo do complemento, então a limpeza em
// zero vale para os dois. Um atômico por grupo em vez de seis por primitiva. Chamada em fluxo uniforme.
// Requer: WORKGROUP_SIZE, ray_common, build, ray_bounds.

var<workgroup> ray_wg_lo: array<vec3f, WORKGROUP_SIZE>;
var<workgroup> ray_wg_hi: array<vec3f, WORKGROUP_SIZE>;

fn ray_reduce_bounds(lid: u32, lo: vec3f, hi: vec3f) {
    ray_wg_lo[lid] = lo;
    ray_wg_hi[lid] = hi;
    workgroupBarrier();
    for (var s = WORKGROUP_SIZE / 2u; s > 0u; s = s >> 1u) {
        if (lid < s) {
            ray_wg_lo[lid] = min(ray_wg_lo[lid], ray_wg_lo[lid + s]);
            ray_wg_hi[lid] = max(ray_wg_hi[lid], ray_wg_hi[lid + s]);
        }
        workgroupBarrier();
    }
    if (lid != 0u) { return; }
    let l = ray_wg_lo[0];
    let h = ray_wg_hi[0];
    if (l.x > h.x) { return; }
    let base = build.slot * 8u;
    atomicMax(&ray_bounds[base], ~ray_order_f32(l.x));
    atomicMax(&ray_bounds[base + 1u], ~ray_order_f32(l.y));
    atomicMax(&ray_bounds[base + 2u], ~ray_order_f32(l.z));
    atomicMax(&ray_bounds[base + 4u], ray_order_f32(h.x));
    atomicMax(&ray_bounds[base + 5u], ray_order_f32(h.y));
    atomicMax(&ray_bounds[base + 6u], ray_order_f32(h.z));
}
