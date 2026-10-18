// Voxels finais do campo com a borda (spec 033, R11): por bloco, os 12³ voxels (o interior e 2 de cada lado), lidos do
// φ redistanciado do próprio bloco e dos 26 vizinhos (`field_links`); sem bloco, φ = +faixa (vazio). A amostra tricúbica
// de quem consulta cabe num bloco só.
// Requer: WORKGROUP_SIZE, NONE, fluid_field, field_common, field_counts (leitura), field_links (leitura), field_src (leitura),
// field_data_voxels, field_volume_write.
// O volume do interior (a fração dentro de cada voxel, ½ − φ/voxel) vai somado ao do quadro (a correção do nível).

var<workgroup> field_wg_volume: atomic<u32>;

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_apron_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let brick = wid.x + wid.y * nwg.x;
    if (brick >= min(field_counts[0].count, fluid_field.sizes.y)) { return; }
    // Sem bloco vizinho: o teto da distância (do lado de fora).
    let cap = f32(fluid_field.sizes.w + 1u) * field_voxel();
    let voxel = field_voxel();
    if (lid == 0u) { atomicStore(&field_wg_volume, 0u); }
    workgroupBarrier();
    var inside = 0.0;
    // 144 fileiras (12 × 12) de 12 voxels em 64 invocações.
    for (var row = lid; row < 144u; row += WORKGROUP_SIZE) {
        let y = i32(row % 12u) - FIELD_APRON;
        let z = i32(row / 12u) - FIELD_APRON;
        for (var x = -FIELD_APRON; x < FIELD_BRICK + FIELD_APRON; x++) {
            let v = vec3i(x, y, z);
            let d = vec3i(floor(vec3f(v) / 8.0));
            let k = u32((d.x + 1) + 3 * ((d.y + 1) + 3 * (d.z + 1)));
            let nb = field_links[brick * 28u + k];
            var phi = cap;
            if (nb != NONE) { phi = field_src[field_interior_at(nb, v - d * FIELD_BRICK)]; }
            field_data_voxels[field_voxel_word(field_apron_at(brick, v))] = phi;
            if (all(d == vec3i(0))) { inside += clamp(0.5 - phi / voxel, 0.0, 1.0); }
        }
    }
    atomicAdd(&field_wg_volume, u32(inside * FIELD_VOLUME_ONE + 0.5));
    workgroupBarrier();
    if (lid == 0u) { atomicAdd(&field_volume[0], atomicLoad(&field_wg_volume)); }
}
