// Comum à composição das nuvens pelo passe de desenho (`sky_composite.wgsl`) e por compute sobre a lista dos blocos
// (`sky_composite_tiles.wgsl`; spec 041, T074).
// Requer: sky_composite_cloud.

// O pixel em que a composição não muda a cor guardada não escreve — o custo da passagem é a banda de ler e escrever a
// cor. O produto: `1 − Tc < 2⁻¹²` é menos de meio ULP do `rgba16float` (11 bits de mantissa): a cor arredondada não muda.
// A soma: abaixo de 2⁻¹² da radiância de uma superfície branca ao sol (E/π), a escala que a exposição da cena mostra. A
// mesma regra marca os blocos da lista (`cloud_upsample.wgsl`, `CLOUD_COMPOSE_EPS`).
const SKY_COMPOSITE_EPS: f32 = 1.0 / 4096.0;

/** A nuvem passa-baixa no pixel da tela `size`: a média de 3 × 3 leituras a 3 pixels (a luz e a transmitância). */
fn sky_composite_cloud_low(px: vec2i, size: vec2i) -> vec4f {
    var sum = vec4f(0.0);
    for (var k = 0; k < 9; k++) {
        let q = clamp(px + 3 * vec2i(k % 3 - 1, k / 3 - 1), vec2i(0), size - 1);
        sum += sky_composite_cloud(vec2u(q));
    }
    return sum / 9.0;
}
