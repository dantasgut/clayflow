// Função pronta do ponto `material` (spec 009) — a assinatura que uma `MaterialFunction` implementa:
//   fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams
// Pronta: as constantes do material, sem emissão (o mesmo que o desenho sem função). O carregador
// `material_fn_params(slot)` lê o registro tipado da função no pool da forma dela (spec 031); a pronta não tem.
// Requer: struct StandardMaterial; material_point_types.

struct MaterialFnParams {
    _unused: u32,
}

fn material_fn_params(slot: u32) -> MaterialFnParams {
    return MaterialFnParams(0u);
}

fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    return SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0));
}
