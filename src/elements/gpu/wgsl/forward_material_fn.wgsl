// Parâmetros de superfície do desenho forward pela função `material` da entidade (spec 009): chama `material_fn` com os
// parâmetros do registro da entidade (`fn_slot`, do registro `Renderable`: o slot no pool da forma da função, lido pelo
// carregador `material_fn_params`, spec 031). Toma o lugar de `forward_material_ready`.
// Requer: struct StandardMaterial; material_point_types; a função (material_fn, material_fn_params).

fn material_eval(s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> SurfaceParams {
    return material_fn(s, m, material_fn_params(fn_slot));
}
