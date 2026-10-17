// Fechamento do desenho forward pela função `material` da 009 (`-> SurfaceParams`): chama `material_fn` com os
// parâmetros do registro da entidade (`fn_slot`, do registro `Renderable`: o slot no pool da forma da função, lido pelo
// carregador `material_fn_params`, spec 031) e adapta à base do OpenPBR (`closure_from_params`, spec 011), saneado.
// Toma o lugar de `forward_material_ready`.
// Requer: struct StandardMaterial; material_point_types; closure; a função (material_fn, material_fn_params).

fn material_eval(s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> Closure {
    return closure_sanitize(closure_from_params(material_fn(s, m, material_fn_params(fn_slot))));
}
