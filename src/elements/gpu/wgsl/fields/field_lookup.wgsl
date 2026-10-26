// Leitura do campo dos fluidos (spec 033, R11) no buffer das consultas (`field_data`): a busca de um bloco na tabela
// (sondagem linear até achar a chave ou um balde vazio), o bloco, um voxel e os limites.
// Requer: NONE, fluid_field, field_common, field_data (leitura).

/** Índice do bloco de coordenadas `b`, ou `NONE`. */
fn field_find(b: vec3i) -> u32 {
    let key = field_key(b);
    if (key == FIELD_EMPTY) { return NONE; }
    var slot = field_bucket(b);
    for (var k = 0u; k < fluid_field.limits.y; k++) {
        let w = field_key_word(slot);
        let found = field_data[w];
        if (found == key) { return field_data[w + 1u]; }
        if (found == FIELD_EMPTY) { return NONE; }
        slot = (slot + 1u) & fluid_field.sizes.z;
    }
    return NONE;
}

/** O superbloco `s` tem algum bloco? */
fn field_super_present(s: vec3i) -> bool {
    let key = field_key(s);
    if (key == FIELD_EMPTY) { return false; }
    var slot = field_super_bucket(s);
    for (var k = 0u; k < fluid_field.limits.y; k++) {
        let found = field_data[field_super_word(slot)];
        if (found == key) { return true; }
        if (found == FIELD_EMPTY) { return false; }
        slot = (slot + 1u) & field_super_mask();
    }
    return true;
}

/** Coordenadas (xyz) e corpo (w) do bloco `brick`. */
fn field_brick_at(brick: u32) -> vec4i {
    let w = field_brick_word(brick);
    return vec4i(bitcast<i32>(field_data[w]), bitcast<i32>(field_data[w + 1u]), bitcast<i32>(field_data[w + 2u]),
        bitcast<i32>(field_data[w + 3u]));
}

/** φ do voxel de índice `i` (de `field_apron_at`). */
fn field_voxel_value(i: u32) -> f32 {
    return bitcast<f32>(field_data[field_voxel_word(i)]);
}

/** Nível da superfície do quadro (o do uniform antes do primeiro ajuste). */
fn field_iso() -> f32 {
    let iso = bitcast<f32>(field_data[FIELD_ISO_WORD]);
    return select(fluid_field.tuning.w, iso, iso > 0.0);
}

/** Limite `k` do campo em voxels (0–2 o menor, 3–5 o maior). */
fn field_bound(k: u32) -> i32 {
    return field_unordered(field_data[k]);
}
