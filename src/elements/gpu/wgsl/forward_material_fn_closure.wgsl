// Fechamento do desenho forward pela função `material` de fechamento da entidade (spec 011): chama `material_fn`
// (`-> Closure`) com os parâmetros do registro da entidade (`fn_slot`) e saneia. Toma o lugar de
// `forward_material_ready`.
// Requer: struct StandardMaterial; material_point_types; closure; a função (material_fn, material_fn_params).

fn material_eval(s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> Closure {
    return closure_sanitize(material_fn(s, m, material_fn_params(fn_slot)));
}
