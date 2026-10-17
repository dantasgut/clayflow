// Fechamento pronto do desenho forward (spec 011): o das constantes do material (albedo, rugosidade, metalicidade) pela
// função pronta do ponto `material`, adaptado à base do OpenPBR (difuso + dielétrico de IOR 1,5 + condutor pela
// metalicidade). Uma entidade com `MaterialFunction` troca este módulo pelo adaptador da função.
// Requer: material_fn_ready (MaterialFnParams, material_fn); material_point_types; closure.

fn material_eval(s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> Closure {
    return closure_from_params(material_fn(s, m, MaterialFnParams(0u)));
}
