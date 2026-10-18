// Função pronta do ponto `fog_density` (spec 033, R12) — a assinatura que uma `DensityFunction` implementa:
//   fn density_fn(p: vec3f, time: f32, data: DensityFnParams) -> f32
// A densidade relativa do meio no ponto `p` (mundo) no tempo simulado `time` (multiplica a extinção do volume). Pronta:
// 1 (o meio homogêneo). O carregador `density_fn_params(slot)` lê o registro tipado da função no pool da forma dela;
// a pronta não tem.

struct DensityFnParams {
    _unused: u32,
}

fn density_fn_params(slot: u32) -> DensityFnParams {
    return DensityFnParams(0u);
}

fn density_fn(p: vec3f, time: f32, data: DensityFnParams) -> f32 {
    return 1.0;
}
