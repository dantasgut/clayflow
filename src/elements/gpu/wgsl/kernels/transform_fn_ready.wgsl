// Função pronta do ponto `transform` (spec 009): a matriz local é o TRS de `transform_local`. Uma `TransformFunction`
// toma o lugar deste módulo (`bindPoints`) com a mesma assinatura:
//   fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f
// `slot` é o índice do Transform no pool, `data` os parâmetros da função e `time` o tempo simulado (s). O carregador
// `transform_fn_params(slot)` lê o registro tipado da função no pool da forma dela (spec 031); a pronta não tem.
// Requer: structs Transform, WorldTransform; transform_local.

struct TransformFnParams {
    _unused: u32,
}

fn transform_fn_params(slot: u32) -> TransformFnParams {
    return TransformFnParams(0u);
}

fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f {
    return transform_local(t).world;
}
