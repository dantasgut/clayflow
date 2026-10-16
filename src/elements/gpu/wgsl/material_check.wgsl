// Kernel de validação do ponto `material` (spec 009): chama `material_eval` pelo adaptador do forward — uma
// `MaterialFunction` é conferida contra ele na criação (o mesmo código que o desenho usa). Não é despachado.
// Requer: structs StandardMaterial; material_point_types; o adaptador (`forward_material_fn`) com o ponto `material`.

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
    let p = material_eval(s, material_check_materials[0], 0u);
    material_check_out[3] = p.base_color + vec4f(p.emissive, p.roughness + p.metallic);
}
