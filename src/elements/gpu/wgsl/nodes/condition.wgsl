// Nós de condição (spec 031, R12): comparação (1,0 verdadeiro, 0,0 falso; a operação é um parâmetro — trocar não
// recompila — com os códigos das constantes compartilhadas `NODE_COMPARE_*`) e escolha por condição (> 0,5).
// Requer: as constantes `NODE_COMPARE_*`.

fn node_condition_compare(a: f32, b: f32, op: u32, epsilon: f32) -> f32 {
    var r = false;
    switch op {
        case NODE_COMPARE_LESS: { r = a < b; }
        case NODE_COMPARE_LESS_EQUAL: { r = a <= b; }
        case NODE_COMPARE_GREATER: { r = a > b; }
        case NODE_COMPARE_GREATER_EQUAL: { r = a >= b; }
        case NODE_COMPARE_EQUAL: { r = abs(a - b) <= epsilon; }
        case NODE_COMPARE_NOT_EQUAL: { r = abs(a - b) > epsilon; }
        default: {}
    }
    return select(0.0, 1.0, r);
}

fn node_condition_select(if_false: f32, if_true: f32, condition: f32) -> f32 {
    return select(if_false, if_true, condition > 0.5);
}

fn node_condition_select3(if_false: vec3f, if_true: vec3f, condition: f32) -> vec3f {
    return select(if_false, if_true, condition > 0.5);
}
