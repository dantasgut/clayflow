// Marcação dos blocos do campo (spec 033, R11): a tabela é limpa a cada quadro (`field_clear_main`); depois, por
// partícula, os blocos que o suporte do núcleo dela cobre (até 2 × 2 × 2: o suporte de 2 espaçamentos cabe num bloco de
// 4) entram na tabela (sondagem com passo ímpar tirado da chave) com troca atômica da chave. O
// índice dos blocos vem do alocador de páginas comum à sombra e às texturas virtuais (`page_alloc.wgsl`, T060f): a soma
// de prefixos dos blocos ganhos no grupo e um atômico por grupo no contador (o registro 0 de `field_counts`, até a
// capacidade — além dela, o bloco fica de fora); então as coordenadas e o corpo. Cada partícula também amplia os limites
// do campo (em voxels, o suporte do núcleo: a caixa justa da água, reduzida no grupo antes dos atômicos globais) — a
// caixa da marcha e o enquadramento da vista da luz. Blocos, contagem e limites nunca voltam à CPU. A limpeza também
// fixa o nível da superfície do quadro: o do anterior (o canal temporal `field_state`, T060f) corrigido pelo volume que
// ele deu contra o das partículas (N ·
// espaçamento³) — o campo conserva o volume em movimento, onde a superfície agitada perderia espessura. Só nos quadros
// em que a simulação avança: parada, o nível fica (a imagem não depende de quantos quadros foram desenhados).
// Requer: WORKGROUP_SIZE, NONE, page_alloc, fluid_field, field_common, field_sorted (leitura, na ordem da grade),
// field_kernel (leitura), field_data_atomic, field_counts_write, field_state, field_state_previous.

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_clear_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i == 0u) {
        atomicStore(&field_counts[0], 0u);
        for (var k = 0u; k < 3u; k++) {
            atomicStore(&field_data_atomic[k], field_ordered(2147483647));
            atomicStore(&field_data_atomic[k + 3u], field_ordered(-2147483647));
        }
        // O nível e o volume do quadro anterior: a fatia anterior do canal temporal (`field_state_previous`).
        let previous = bitcast<f32>(field_state_previous[0]);
        let volume = f32(field_state_previous[1]) / FIELD_VOLUME_ONE;
        let wanted = f32(fluid_field.sizes.x) * pow(fluid_field.grid.x / fluid_field.grid.y, 3.0);
        var iso = fluid_field.tuning.w;
        if (previous > 0.0 && fluid_field.motion.x == 0u) {
            iso = previous;
        } else if (previous > 0.0 && volume > 0.0 && wanted > 0.0) {
            iso = clamp(previous * pow(volume / wanted, FIELD_ISO_GAIN), FIELD_ISO_MIN, FIELD_ISO_MAX);
        }
        // O nível do quadro: no estado (o seguinte o lê) e no cabeçalho das consultas; o volume do quadro recomeça.
        atomicStore(&field_state[0], bitcast<u32>(iso));
        atomicStore(&field_state[1], 0u);
        atomicStore(&field_data_atomic[FIELD_ISO_WORD], bitcast<u32>(iso));
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
    let step = field_step(s);
    for (var k = 0u; k < 4u * fluid_field.limits.y; k++) {
        let old = atomicCompareExchangeWeak(&field_data_atomic[field_super_word(slot)], FIELD_EMPTY, key);
        if (!old.exchanged && old.old_value == FIELD_EMPTY) { continue; }
        if (old.exchanged || old.old_value == key) { return; }
        slot = (slot + step) & field_super_mask();
    }
}

/** Blocos ganhos por uma invocação no máximo (o suporte de uma partícula cobre até 2 × 2 × 2 blocos). */
const FIELD_MARK_WON: u32 = 8u;
/** Invocações do grupo da marcação: as do alocador de páginas comum (`page_alloc.wgsl`). */
const FIELD_MARK_GROUP: u32 = 256u;

// Os baldes que a invocação ganhou na troca da chave (o bloco e o corpo de cada um): o índice dos blocos sai depois,
// pela soma de prefixos do grupo (`pa_exclusive`) e um atômico por grupo — os blocos de um grupo ficam juntos, na ordem
// das invocações.
var<private> field_won_slot: array<u32, FIELD_MARK_WON>;
var<private> field_won_brick: array<vec4i, FIELD_MARK_WON>;
var<private> field_won_count: u32;
var<workgroup> field_wg_base: u32;

/** Insere a chave do bloco `b` (com o corpo `m`) na tabela; o balde ganho fica na lista da invocação. */
fn field_insert(b: vec3i, m: u32) {
    let key = field_key(b);
    if (key == FIELD_EMPTY) { return; }
    var slot = field_bucket(b);
    let step = field_step(b);
    var probes = 0u;
    for (var k = 0u; k < 4u * fluid_field.limits.y && probes < fluid_field.limits.y; k++) {
        let old = atomicCompareExchangeWeak(&field_data_atomic[field_key_word(slot)], FIELD_EMPTY, key);
        // A troca fraca pode falhar com o balde ainda vazio: tenta o mesmo balde de novo.
        if (!old.exchanged && old.old_value == FIELD_EMPTY) { continue; }
        if (old.exchanged) {
            if (field_won_count < FIELD_MARK_WON) {
                field_won_slot[field_won_count] = slot;
                field_won_brick[field_won_count] = vec4i(b, i32(m));
                field_won_count++;
            }
            return;
        }
        if (old.old_value == key) { return; }
        slot = (slot + step) & fluid_field.sizes.z;
        probes++;
    }
}

/** Grava os blocos ganhos pela invocação a partir do índice `first` (até a capacidade; além dela, ficam de fora). */
fn field_store_won(first: u32) {
    for (var j = 0u; j < field_won_count; j++) {
        let index = first + j;
        if (index >= fluid_field.sizes.y) { return; }
        let b = field_won_brick[j];
        let w = field_brick_word(index);
        atomicStore(&field_data_atomic[w], bitcast<u32>(b.x));
        atomicStore(&field_data_atomic[w + 1u], bitcast<u32>(b.y));
        atomicStore(&field_data_atomic[w + 2u], bitcast<u32>(b.z));
        atomicStore(&field_data_atomic[w + 3u], u32(b.w));
        atomicStore(&field_data_atomic[field_key_word(field_won_slot[j]) + 1u], index);
        field_insert_super(field_super_of(b.xyz));
    }
}

var<workgroup> field_wg_bounds: array<atomic<i32>, 6>;
// Chaves dos blocos já inseridos pelo grupo (as partículas de um grupo, na ordem da grade, cobrem poucos blocos: uma
// inserção global por bloco em vez de uma por partícula).
const FIELD_WG_KEYS: u32 = 512u;
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

@compute @workgroup_size(FIELD_MARK_GROUP)
fn field_mark_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    if (lid < 3u) {
        atomicStore(&field_wg_bounds[lid], 2147483647);
        atomicStore(&field_wg_bounds[lid + 3u], -2147483647);
    }
    for (var k = lid; k < FIELD_WG_KEYS; k += FIELD_MARK_GROUP) { atomicStore(&field_wg_keys[k], FIELD_EMPTY); }
    field_won_count = 0u;
    workgroupBarrier();
    let t = gid3.x + gid3.y * nwg.x * FIELD_MARK_GROUP;
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
    // O índice dos blocos ganhos: a posição deles no grupo e a base do grupo (um atômico por grupo).
    let offset = pa_exclusive(lid, field_won_count);
    if (lid == FIELD_MARK_GROUP - 1u) { field_wg_base = atomicAdd(&field_counts[0], pa_rank[lid]); }
    let base = workgroupUniformLoad(&field_wg_base);
    field_store_won(base + offset);
    if (lid < 3u) {
        atomicMin(&field_data_atomic[lid], field_ordered(atomicLoad(&field_wg_bounds[lid])));
        atomicMax(&field_data_atomic[lid + 3u], field_ordered(atomicLoad(&field_wg_bounds[lid + 3u])));
    }
}

