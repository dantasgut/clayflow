// A caixa da geometria de um grupo do desenho principal no espaço do objeto (spec 034, T060d): um despacho de um grupo
// de 256 por geometria, ligado aos vértices dela (`vertex_bounds`); o grupo vem da região do despacho. Guardada no
// trabalho até a geometria mudar (a deformada pela GPU, a cada quadro).

@compute @workgroup_size(256)
fn dc_bounds_main(@builtin(local_invocation_index) lid: u32) {
    let box = vertex_bounds(lid);
    if (lid == 0u) {
        let g = dc_step.value.x;
        dc_bounds[2u * g] = vec4f(box[0], 0.0);
        dc_bounds[2u * g + 1u] = vec4f(box[1], 0.0);
    }
}
