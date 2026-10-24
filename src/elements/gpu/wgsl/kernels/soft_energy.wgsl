// Energia dos corpos moles, passada 2 (spec 037): a série temporal `SoftBodyEnergy` (canal da C2, no slot da faixa do
// corpo). Um grupo por registro `SoftBodyRange` com algoritmo: cada invocação soma a sua fatia estriada das somas dos
// blocos do corpo (`soft_partials[first_chunk ..]`, da passada 1) e o grupo reduz em árvore, em ordem fixa. A invocação
// 0 grava a fatia: os três termos, a potência dissipada no passo (E da fatia anterior − E)/dt e a energia dissipada na
// janela (E da fatia mais antiga − E), cada uma só quando a série já tem a fatia (`counts.y`, os passos gravados).
// Requer: WORKGROUP_SIZE, soft_energy_params, soft_ranges, soft_partials_read, soft_energy, soft_energy_previous,
// soft_energy_oldest.

var<workgroup> soft_energy_total: array<vec3f, WORKGROUP_SIZE>;
var<workgroup> soft_energy_live: u32;

@compute @workgroup_size(WORKGROUP_SIZE)
fn soft_energy_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lane: u32,
) {
    let i = wid.x + wid.y * nwg.x;
    if (lane == 0u) {
        var live = 0u;
        if (i < soft_energy_params.counts.x) { live = select(0u, 1u, soft_ranges[i].algorithm != 0u); }
        soft_energy_live = live;
    }
    if (workgroupUniformLoad(&soft_energy_live) == 0u) { return; }
    let r = soft_ranges[i];
    var sum = vec3f(0.0);
    for (var k = lane; k < r.chunk_count; k += WORKGROUP_SIZE) {
        let p = soft_partials_read[r.first_chunk + k];
        sum += vec3f(p.kinetic, p.potential, p.elastic);
    }
    soft_energy_total[lane] = sum;
    workgroupBarrier();
    for (var s = WORKGROUP_SIZE / 2u; s > 0u; s = s >> 1u) {
        if (lane < s) { soft_energy_total[lane] += soft_energy_total[lane + s]; }
        workgroupBarrier();
    }
    if (lane != 0u) { return; }
    let t = soft_energy_total[0];
    let e = t.x + t.y + t.z;
    var power = 0.0;
    var window = 0.0;
    if (soft_energy_params.counts.y >= 1u) {
        let p = soft_energy_previous[i];
        power = (p.kinetic + p.potential + p.elastic - e) / soft_energy_params.gravity.w;
    }
    if (soft_energy_params.counts.y >= soft_energy_params.counts.z - 1u) {
        let o = soft_energy_oldest[i];
        window = o.kinetic + o.potential + o.elastic - e;
    }
    soft_energy[i] = SoftBodyEnergy(t.x, t.y, t.z, power, window, 0.0, 0.0, 0.0);
}
