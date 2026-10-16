// Ondulações capilares procedurais da água (spec 017): o detalhe que a simulação de partículas não resolve (ondas de
// milímetros a centímetros), somado à normal da superfície na composição e nas cáusticas. Oito trens de onda com
// direções no ângulo áureo e comprimentos de `rippleSize` a cerca de um terço dele, fase pela dispersão de águas profundas
// (ω = √(g k), escalada por `rippleSpeed`) e o tempo da cena — determinístico. Devolve a inclinação (∂h/∂x, ∂h/∂z) em
// mundo, de módulo até `rippleStrength`. Struct `FluidSurfaceMaterial` gerado do schema.

const WATER_RIPPLE_WAVES: u32 = 8u;

fn water_ripple_slope(xz: vec2f, time: f32, material: FluidSurfaceMaterial) -> vec2f {
    if (material.rippleStrength <= 0.0) { return vec2f(0.0); }
    var slope = vec2f(0.0);
    for (var i = 0u; i < WATER_RIPPLE_WAVES; i = i + 1u) {
        // Direções no ângulo áureo e comprimentos não harmônicos: sem a grade regular de poucos trens de onda.
        let angle = f32(i) * 2.3999632 + 0.4;
        let d = vec2f(cos(angle), sin(angle));
        let scale = 1.0 / (1.0 + 0.27 * f32(i));
        let k = 6.2831853 / (material.rippleSize * scale);
        let omega = sqrt(9.81 * k) * material.rippleSpeed;
        let phase = k * dot(d, xz) - omega * time + f32(i) * 2.17;
        slope = slope + d * cos(phase);
    }
    return slope * (material.rippleStrength / f32(WATER_RIPPLE_WAVES));
}

// Peso das ondulações pela orientação da superfície: só nas faces voltadas para cima (lâminas verticais e respingos
// ficam com a normal da simulação).
fn water_ripple_weight(world_normal: vec3f) -> f32 {
    return smoothstep(0.3, 0.8, world_normal.y);
}
