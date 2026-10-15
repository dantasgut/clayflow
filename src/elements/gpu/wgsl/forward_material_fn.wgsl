// Parâmetros de superfície do desenho forward pela função `material` da entidade (spec 009): liga o pool
// `MaterialFnRecord` (grupo 2, binding 2 — o grupo do material, religado a cada pipeline) e chama `material_fn` com os
// parâmetros do registro da entidade (`fn_slot`, do registro `Renderable`). Toma o lugar de `forward_material_ready`.
// Requer: structs StandardMaterial, MaterialFnRecord; material_point_types; a função (material_fn, material_fn_params).

@group(2) @binding(2) var<storage, read> material_fn_records: array<MaterialFnRecord>;

fn material_eval(s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> SurfaceParams {
    return material_fn(s, m, material_fn_params(material_fn_records[fn_slot]));
}
