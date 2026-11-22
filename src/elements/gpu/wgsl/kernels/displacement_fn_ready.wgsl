// Função pronta do ponto `displacement` (spec 011): sem deslocamento — a superfície é a da função `surface`. Uma
// `DisplacementFunction` toma o lugar deste módulo com a mesma assinatura:
//   fn displacement_fn(s: SurfaceSample, data: DisplacementFnParams) -> f32
// a altura (nas unidades da superfície) ao longo da normal no ponto da amostra `s`. O carregador
// `displacement_fn_params(slot)` lê o registro tipado da função no pool da forma dela (spec 031); a pronta não tem.
// Requer: surface_sample (SurfaceSample).

struct DisplacementFnParams {
    _unused: u32,
}

fn displacement_fn_params(slot: u32) -> DisplacementFnParams {
    return DisplacementFnParams(0u);
}

fn displacement_fn(s: SurfaceSample, data: DisplacementFnParams) -> f32 {
    return 0.0;
}
