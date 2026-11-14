// Grade hash espacial ilimitada (spec 007): célula de um ponto e o seu balde na tabela. Distintas células podem cair no
// mesmo balde; quem consulta aceita um item só se a célula dele for a consultada (sem duplicatas nem perdas).

fn sh_cell(p: vec3f, cell_size: f32) -> vec3i {
    return vec3i(floor(p / cell_size));
}

fn sh_hash(c: vec3i, mask: u32) -> u32 {
    return hash_cell(bitcast<vec3u>(c)) & mask;
}
