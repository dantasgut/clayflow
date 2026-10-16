// Parâmetros de superfície do desenho forward prontos (spec 009): os da função pronta do ponto `material` — as
// constantes do material (albedo, rugosidade, metalicidade), sem emissão. Uma entidade com `MaterialFunction` troca
// este módulo pelo adaptador da função.
// Requer: material_fn_ready (MaterialFnParams, material_fn); material_point_types.

fn material_eval(s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> SurfaceParams {
    return material_fn(s, m, MaterialFnParams(0u));
}
