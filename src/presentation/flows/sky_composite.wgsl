// Composição das nuvens na tela (spec 041, R13): um triângulo de tela cheia depois da água, antes da resolução temporal,
// com uma `CloudLayer` na cena. A atmosfera e a névoa até a superfície (ou até o fundo) já estão na cor: `cor`. Em cada
// pixel, `(Sc, Tc)` a nuvem aumentada, já marchada até a superfície e com tudo o que está na frente dela até a
// profundidade dela (spec 041, R21: os meios perto da câmera — a névoa dos volumes e a atmosfera nos froxels — e a
// perspectiva aérea além deles; antes, a névoa dos volumes entrava aqui, pela frente da nuvem inteira, e a atmosfera
// pela marcha — com a atmosfera nos froxels, o ar atrás de uma nuvem a menos de 32 km ficaria na frente dela):
//   final = cor·Tc + Sc
// Dois passes com mistura do hardware: o produto `cor·Tc` (`sky_composite_multiply_fs`, mistura `dst·src`) e a soma
// (`sky_composite_add_fs`, mistura `src + dst`).
// A luz que chega no fundo com nuvens (spec 041, o traço na nuvem acima do sol no `solposto`): o histórico parado da
// resolução temporal (64 quadros, sem recorte) é reiluminado pela razão da luz que chega; com a luz do céu atrás das
// nuvens nela, a mudança da luz das próprias nuvens (o sol descendo, o pico de frente andando com ele) não era seguida —
// o histórico ficava ~1 s para trás, e onde a máscara do disco recomeçava aparecia a nuvem de agora no meio da atrasada:
// um traço claro (ou escuro) ao longo do caminho do sol. Com o alvo da luz, os mesmos dois passes o levam a
// `luz·Tc' + Y(Sc')` — a nuvem passa-baixa (`sky_composite_cloud_low`: a média 3 × 3 a 3 pixels, mais larga que o texel
// da marcha), lisa: o detalhe menor que o texel não entra na faixa 3 × 3 da reiluminação, e a mudança da nuvem entra.
// Requer: refraction_screen (o triângulo), sky_composite_cloud, sky, constants, sky_composite_depth.

// O pixel em que a composição não muda a cor guardada não escreve — o custo da passagem é a banda de ler e escrever a
// cor. O produto: `1 − Tc < 2⁻¹²` é menos de meio ULP do `rgba16float` (11 bits de mantissa): a cor arredondada não muda.
// A soma: abaixo de 2⁻¹² da radiância de uma superfície branca ao sol (E/π), a escala que a exposição da cena mostra.
const SKY_COMPOSITE_EPS: f32 = 1.0 / 4096.0;

/** A nuvem passa-baixa no pixel: a média de 3 × 3 leituras a 3 pixels (a luz e a transmitância). */
fn sky_composite_cloud_low(px: vec2i) -> vec4f {
    let size = vec2i(sky_composite_depth_size());
    var sum = vec4f(0.0);
    for (var k = 0; k < 9; k++) {
        let q = clamp(px + 3 * vec2i(k % 3 - 1, k / 3 - 1), vec2i(0), size - 1);
        sum += sky_composite_cloud(vec2u(q));
    }
    return sum / 9.0;
}

struct SkyCompositeLightOut {
    @location(0) color: vec4f,
    @location(1) light: vec4f,
}

@fragment
fn sky_composite_multiply_light_fs(@builtin(position) frag: vec4f) -> SkyCompositeLightOut {
    let k = sky_composite_cloud(vec2u(frag.xy)).a;
    let low = sky_composite_cloud_low(vec2i(frag.xy)).a;
    if (min(k, low) > 1.0 - SKY_COMPOSITE_EPS) { discard; }
    return SkyCompositeLightOut(vec4f(vec3f(k), 1.0), vec4f(low, low, 0.0, 1.0));
}

@fragment
fn sky_composite_add_light_fs(@builtin(position) frag: vec4f) -> SkyCompositeLightOut {
    let cloud = sky_composite_cloud(vec2u(frag.xy));
    let low = sky_composite_cloud_low(vec2i(frag.xy));
    // O brilho como o do fundo na luz que chega (o Y do YCoCg).
    let y = clamp(dot(low.rgb, vec3f(0.25, 0.5, 0.25)), 0.0, 60000.0);
    return SkyCompositeLightOut(vec4f(cloud.rgb, 0.0), vec4f(y, y, 0.0, 0.0));
}

fn sky_composite_multiply(frag: vec4f) -> vec4f {
    let k = sky_composite_cloud(vec2u(frag.xy)).a;
    if (k > 1.0 - SKY_COMPOSITE_EPS) { discard; }
    return vec4f(vec3f(k), 1.0);
}

fn sky_composite_add(frag: vec4f) -> vec4f {
    let cloud = sky_composite_cloud(vec2u(frag.xy));
    let white = max(max(sky.sunIlluminance.r, sky.sunIlluminance.g), sky.sunIlluminance.b) / PI;
    if (all(abs(cloud.rgb) < vec3f(SKY_COMPOSITE_EPS * white))) {
        // Nenhuma luz da nuvem no pixel (abaixo da precisão).
        discard;
    }
    return vec4f(cloud.rgb, 0.0);
}

@fragment
fn sky_composite_multiply_fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    return sky_composite_multiply(frag);
}

@fragment
fn sky_composite_add_fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    return sky_composite_add(frag);
}
