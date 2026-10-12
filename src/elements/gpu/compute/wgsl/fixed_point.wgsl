// Ponto fixo para somas atômicas de valores reais (WGSL não tem atomics de f32) — research R10. A escala é parâmetro:
// resolução 1/scale, faixa ±FIXED_LIMIT/scale (o LCP usa 2²⁰: ~1e-6, ±2048). Arredondamento ao inteiro mais próximo
// (empate para o par, como `round` do WGSL).

// Maior f32 abaixo de 2³¹ (2³¹ − 128): a conversão para i32 é exata e não estoura.
const FIXED_LIMIT: f32 = 2147483520.0;

fn fixed_from_f32(x: f32, scale: f32) -> i32 {
    return i32(round(clamp(x * scale, -FIXED_LIMIT, FIXED_LIMIT)));
}

fn fixed_to_f32(v: i32, scale: f32) -> f32 {
    return f32(v) / scale;
}

// Verdadeiro quando `x` não cabe na faixa e `fixed_from_f32` saturou (diagnóstico).
fn fixed_saturated(x: f32, scale: f32) -> bool {
    return abs(x * scale) >= FIXED_LIMIT;
}
