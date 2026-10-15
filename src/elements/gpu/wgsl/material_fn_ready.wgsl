// Função pronta do ponto `material` (spec 009) — a assinatura que uma `MaterialFunction` implementa:
//   fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams
// Pronta: as constantes do material, sem emissão (o mesmo que o desenho sem função).
// Requer: structs StandardMaterial, MaterialFnRecord; material_point_types.

struct MaterialFnParams {
    _unused: u32,
}

fn material_fn_params(r: MaterialFnRecord) -> MaterialFnParams {
    return MaterialFnParams(0u);
}

fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    return SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0));
}
