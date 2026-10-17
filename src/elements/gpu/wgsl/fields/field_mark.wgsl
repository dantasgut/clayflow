// Marcação dos blocos do campo (spec 033, R11): a tabela é limpa a cada quadro (`field_clear_main`); depois, por
// partícula, os blocos que o suporte do núcleo dela cobre (até 2 × 2 × 2: o suporte de 2 espaçamentos cabe num bloco de
// 4) entram na tabela por sondagem linear com troca atômica da chave; quem insere a chave aloca o índice do bloco pelo
// contador (o registro 0 de `field_counts`, até a capacidade — além dela, o bloco fica de fora) e grava as coordenadas e
// o material. Cada partícula também amplia os limites do campo (em voxels, o suporte do núcleo: a caixa justa da água,
// reduzida no grupo antes dos atômicos globais) — a caixa da marcha e o enquadramento da vista da luz. Blocos,
// contagem e limites nunca voltam à CPU. A limpeza também fixa o nível da superfície do quadro: o do anterior corrigido
// pelo volume que ele deu contra o das partículas (N · espaçamento³) — o campo conserva o volume em movimento, onde a
// superfície agitada perderia espessura.
// Requer: WORKGROUP_SIZE, NONE, fluid_field, field_common, field_sorted (leitura, na ordem da grade), field_kernel
// (leitura),
// field_data_atomic, field_counts_write, field_volume_write.

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_clear_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i == 0u) {
        atomicStore(&field_counts[0], 0u);
        for (var k = 0u; k < 3u; k++) {
            atomicStore(&field_data_atomic[k], field_ordered(2147483647));
            atomicStore(&field_data_atomic[k + 3u], field_ordered(-2147483647));
        }
        let previous = bitcast<f32>(atomicLoad(&field_data_atomic[FIELD_ISO_WORD]));
        let volume = f32(atomicLoad(&field_volume[0])) / FIELD_VOLUME_ONE;
        let wanted = f32(fluid_field.sizes.x) * pow(fluid_field.grid.x / fluid_field.grid.y, 3.0);
        var iso = fluid_field.tuning.w;
        if (previous > 0.0 && volume > 0.0 && wanted > 0.0) {
            iso = clamp(previous * pow(volume / wanted, FIELD_ISO_GAIN), FIELD_ISO_MIN, FIELD_ISO_MAX);
        }
        atomicStore(&field_data_atomic[FIELD_ISO_WORD], bitcast<u32>(iso));
        atomicStore(&field_volume[0], 0u);
    }
    if (i > fluid_field.sizes.z) { return; }
    atomicStore(&field_data_atomic[field_key_word(i)], FIELD_EMPTY);
    atomicStore(&field_data_atomic[field_key_word(i) + 1u], NONE);
    if (i <= field_super_mask()) { atomicStore(&field_data_atomic[field_super_word(i)], FIELD_EMPTY); }
}

/** Marca o superbloco `s` como ocupado. */
fn field_insert_super(s: vec3i) {
    let key = field_key(s);
    if (key == FIELD_EMPTY) { return; }
    var slot = field_super_bucket(s);
    for (var k = 0u; k < 4u * fluid_field.limits.y; k++) {
        let old = atomicCompareExchangeWeak(&field_data_atomic[field_super_word(slot)], FIELD_EMPTY, key);
        if (!old.exchanged && old.old_value == FIELD_EMPTY) { continue; }
        if (old.exchanged || old.old_value == key) { return; }
        slot = (slot + 1u) & field_super_mask();
    }
}

/** Insere o bloco `b` (com o material `m`) na tabela; devolve o índice dele ou `NONE`. */
fn field_insert(b: vec3i, m: u32) -> u32 {
    let key = field_key(b);
    if (key == FIELD_EMPTY) { return NONE; }
    var slot = field_bucket(b);
    var probes = 0u;
    for (var k = 0u; k < 4u * fluid_field.limits.y && probes < fluid_field.limits.y; k++) {
        let old = atomicCompareExchangeWeak(&field_data_atomic[field_key_word(slot)], FIELD_EMPTY, key);
        // A troca fraca pode falhar com o balde ainda vazio: tenta o mesmo balde de novo.
        if (!old.exchanged && old.old_value == FIELD_EMPTY) { continue; }
        if (old.exchanged) {
            let index = atomicAdd(&field_counts[0], 1u);
            if (index < fluid_field.sizes.y) {
                let w = field_brick_word(index);
                atomicStore(&field_data_atomic[w], bitcast<u32>(b.x));
                atomicStore(&field_data_atomic[w + 1u], bitcast<u32>(b.y));
                atomicStore(&field_data_atomic[w + 2u], bitcast<u32>(b.z));
                atomicStore(&field_data_atomic[w + 3u], m);
                atomicStore(&field_data_atomic[field_key_word(slot) + 1u], index);
                field_insert_super(field_super_of(b));
                return index;
            }
            return NONE;
        }
        if (old.old_value == key) { return NONE; }
        slot = (slot + 1u) & fluid_field.sizes.z;
        probes++;
    }
    return NONE;
}

var<workgroup> field_wg_bounds: array<atomic<i32>, 6>;
// Chaves dos blocos já inseridos pelo grupo (as partículas de um grupo, na ordem da grade, cobrem poucos blocos: uma
// inserção global por bloco em vez de uma por partícula).
const FIELD_WG_KEYS: u32 = 256u;
var<workgroup> field_wg_keys: array<atomic<u32>, FIELD_WG_KEYS>;

/** Insere o bloco `b` se o grupo ainda não o inseriu. */
fn field_insert_once(b: vec3i, m: u32) {
    let key = field_key(b);
    if (key == FIELD_EMPTY) { return; }
    var slot = field_bucket(b) & (FIELD_WG_KEYS - 1u);
    for (var k = 0u; k < 16u; k++) {
        let old = atomicCompareExchangeWeak(&field_wg_keys[slot], FIELD_EMPTY, key);
        if (!old.exchanged && old.old_value == FIELD_EMPTY) { continue; }
        if (old.exchanged) { field_insert(b, m); return; }
        if (old.old_value == key) { return; }
        slot = (slot + 1u) & (FIELD_WG_KEYS - 1u);
    }
    // Tabela do grupo cheia: direto na global (que também deduplica).
    field_insert(b, m);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_mark_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    if (lid < 3u) {
        atomicStore(&field_wg_bounds[lid], 2147483647);
        atomicStore(&field_wg_bounds[lid + 3u], -2147483647);
    }
    for (var k = lid; k < FIELD_WG_KEYS; k += WORKGROUP_SIZE) { atomicStore(&field_wg_keys[k], FIELD_EMPTY); }
    workgroupBarrier();
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    var live = t < fluid_field.sizes.x;
    let i = t;
    if (live) { live = field_sorted[t].w >= 0.0; }
    if (live) {
        let center = field_kernel[i * 3u].xyz;
        let reach = field_kernel[i * 3u + 2u].z;
        let lo = field_brick_of(center - vec3f(reach));
        let hi = field_brick_of(center + vec3f(reach));
        let m = u32(field_sorted[i].w);
        for (var z = lo.z; z <= hi.z; z++) {
            for (var y = lo.y; y <= hi.y; y++) {
                for (var x = lo.x; x <= hi.x; x++) { field_insert_once(vec3i(x, y, z), m); }
            }
        }
        let vlo = vec3i(floor((center - vec3f(reach)) / field_voxel()));
        let vhi = vec3i(ceil((center + vec3f(reach)) / field_voxel()));
        for (var a = 0u; a < 3u; a++) {
            atomicMin(&field_wg_bounds[a], vlo[a]);
            atomicMax(&field_wg_bounds[a + 3u], vhi[a]);
        }
    }
    workgroupBarrier();
    if (lid < 3u) {
        atomicMin(&field_data_atomic[lid], field_ordered(atomicLoad(&field_wg_bounds[lid])));
        atomicMax(&field_data_atomic[lid + 3u], field_ordered(atomicLoad(&field_wg_bounds[lid + 3u])));
    }
}
