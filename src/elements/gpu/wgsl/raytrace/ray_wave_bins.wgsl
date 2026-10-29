// A separação da onda por classe (spec 039, R3): depois do traçado de uma rodada, `ray_wave_scan_main` (uma invocação)
// soma as contagens das classes em faixas na ordem (`ray_wave_ranges`: início e tamanho de cada classe), zera os
// cursores e grava os argumentos indiretos — os do kernel de material de cada classe e, depois deles, os do
// espalhamento (sobre os registros da rodada); `ray_wave_scatter_main` põe o índice de cada registro na faixa da sua
// classe (a ordem dentro da classe não importa: cada kernel de material grava no índice do próprio registro); e
// `ray_wave_reset_main` zera as contagens antes da rodada. Os despachos dividem os grupos em x/y como
// `Dispatcher.invocations` (`RAY_WAVE_MAX_X` grupos por dimensão).
// Requer: WORKGROUP_SIZE, RayWaveHit, ray_wave_hits_in, ray_wave_counts, ray_wave_ranges, ray_wave_ranges_out,
// ray_wave_order_out, ray_wave_args.

/** Grupos por dimensão do despacho (o limite do dispositivo). */
override RAY_WAVE_MAX_X: u32 = 65535u;

/** Classes da onda (as faixas). */
fn ray_wave_classes() -> u32 {
    return arrayLength(&ray_wave_ranges_out);
}

/** Os argumentos indiretos de `count` invocações no registro `k` (três palavras). */
fn ray_wave_write_args(k: u32, count: u32) {
    let groups = (count + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;
    let x = min(groups, RAY_WAVE_MAX_X);
    let y = select(1u, (groups + RAY_WAVE_MAX_X - 1u) / RAY_WAVE_MAX_X, groups > 0u);
    ray_wave_args[k * 3u] = select(0u, x, groups > 0u);
    ray_wave_args[k * 3u + 1u] = select(0u, y, groups > 0u);
    ray_wave_args[k * 3u + 2u] = select(0u, 1u, groups > 0u);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_wave_reset_main(@builtin(global_invocation_id) gid: vec3u) {
    let n = arrayLength(&ray_wave_counts);
    if (gid.x >= n) { return; }
    atomicStore(&ray_wave_counts[gid.x], 0u);
}

@compute @workgroup_size(1)
fn ray_wave_scan_main() {
    let classes = ray_wave_classes();
    var start = 0u;
    for (var k = 0u; k < classes; k++) {
        let count = atomicLoad(&ray_wave_counts[1u + k]);
        ray_wave_ranges_out[k] = vec2u(start, count);
        atomicStore(&ray_wave_counts[1u + classes + k], 0u);
        ray_wave_write_args(k, count);
        start += count;
    }
    ray_wave_write_args(classes, atomicLoad(&ray_wave_counts[0]));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_wave_scatter_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid.x + gid.y * nwg.x * WORKGROUP_SIZE;
    if (i >= atomicLoad(&ray_wave_counts[0])) { return; }
    let cls = ray_wave_hits_in[i].cls;
    let classes = arrayLength(&ray_wave_ranges);
    if (cls >= classes) { return; }
    let k = atomicAdd(&ray_wave_counts[1u + classes + cls], 1u);
    ray_wave_order_out[ray_wave_ranges[cls].x + k] = i;
}
