// Kernel de validação do ponto `field` (spec 009): monta `field_accel` com os globais que os solvers declaram — uma
// `FieldFunction` é conferida contra ele na criação (assinatura, símbolos, chamadas). Não é despachado.
// Requer: structs FieldFnRecord; field_point_types; field_accel (ponto).

@group(0) @binding(0) var<storage, read>       field_records: array<FieldFnRecord>;
@group(0) @binding(1) var<storage, read>       field_live:    array<u32>;
@group(0) @binding(2) var<storage, read_write> field_out:     array<vec4f>;

@compute @workgroup_size(1)
fn field_check_main() {
    let body = FieldBody(1.0, 1000.0, 1.0, 0.0);
    field_out[0] = vec4f(field_accel(field_out[0].xyz, field_out[1].xyz, field_out[2].w, body), 0.0);
}
