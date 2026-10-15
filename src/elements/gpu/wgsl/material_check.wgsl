// Kernel de validação do ponto `material` (spec 009): chama `material_fn` como o adaptador do forward — uma
// `MaterialFunction` é conferida contra ele na criação. Não é despachado.
// Requer: structs StandardMaterial, MaterialFnRecord; material_point_types; material_fn (ponto).

@group(0) @binding(0) var<storage, read>       material_check_materials: array<StandardMaterial>;
@group(0) @binding(1) var<storage, read>       material_check_records:   array<MaterialFnRecord>;
@group(0) @binding(2) var<storage, read_write> material_check_out:       array<vec4f>;

@compute @workgroup_size(1)
fn material_check_main() {
    let s = SurfaceSample(
        material_check_out[0].xyz,
        material_check_out[1].xyz,
        material_check_out[2].xy,
        0.0,
        vec3f(0.0),
        vec4f(0.0),
        vec3f(0.0),
    );
    let p = material_fn(s, material_check_materials[0], material_fn_params(material_check_records[0]));
    material_check_out[3] = p.base_color + vec4f(p.emissive, p.roughness + p.metallic);
}
