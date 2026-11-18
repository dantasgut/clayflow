// Composição das nuvens na tela (spec 041, R13): um triângulo de tela cheia depois da água, antes da resolução temporal,
// com uma `CloudLayer` na cena. A atmosfera até a superfície já está na cor (o `Sky` contribui a `scene_fog`, atrás da
// névoa dos volumes): a cor da cena é `Sfog + Tfog·(L·Ta + Sa)`. Em cada pixel, com `(Sc, Tc)` a nuvem aumentada (já
// marchada até a superfície e com a perspectiva aérea até ela) e `(Sfog, Tfog)` a névoa dos volumes, na frente da nuvem
// (R13: a névoa é perto, a nuvem longe — a névoa do fundo, `scene_fog` no infinito, sem a atmosfera, que já está no
// céu):
//   final = Sfog + Tfog·(Sc + Tc·(L·Ta + Sa)) = cor·Tc + Sfog·(1 − Tc) + Tfog·Sc
// Dois passes com mistura do hardware: o produto `cor·Tc` (`sky_composite_multiply_fs`, mistura `dst·src`) e a soma do
// resto (`sky_composite_add_fs`, mistura `src + dst`).
// A luz que chega no fundo com nuvens (spec 041, o traço na nuvem acima do sol no `solposto`): o histórico parado da
// resolução temporal (64 quadros, sem recorte) é reiluminado pela razão da luz que chega; com a luz do céu atrás das
// nuvens nela, a mudança da luz das próprias nuvens (o sol descendo, o pico de frente andando com ele) não era seguida —
// o histórico ficava ~1 s para trás, e onde a máscara do disco recomeçava aparecia a nuvem de agora no meio da atrasada:
// um traço claro (ou escuro) ao longo do caminho do sol. Com o alvo da luz, os mesmos dois passes o levam a
// `luz·Tc' + Y(Sc')` — a nuvem passa-baixa (`sky_composite_cloud_low`: a média 3 × 3 a 3 pixels, mais larga que o texel
// da marcha), lisa: o detalhe menor que o texel não entra na faixa 3 × 3 da reiluminação, e a mudança da nuvem entra.
// Requer: refraction_screen (o triângulo), sky_composite_cloud, camera_space, scene_fog, SCENE_FOG_BACKGROUND, sky,
// cameras, constants, sky_composite_depth.

// O pixel em que a composição não muda a cor guardada não escreve — o custo da passagem é a banda de ler e escrever a
// cor. O produto: `1 − Tc < 2⁻¹²` é menos de meio ULP do `rgba16float` (11 bits de mantissa): a cor arredondada não muda.
// A soma: abaixo de 2⁻¹² da radiância de uma superfície branca ao sol (E/π), a escala que a exposição da cena mostra.
const SKY_COMPOSITE_EPS: f32 = 1.0 / 4096.0;

/** A névoa dos volumes na frente da nuvem: a do raio do pixel até o infinito (sem a atmosfera, que já está no fundo). */
fn sky_composite_fog(frag: vec4f) -> SceneFog {
    let size = vec2f(sky_composite_depth_size());
    let ray = camera_ray(sky.cameraSlot, floor(frag.xy) + 0.5, size);
    return scene_fog(ray.origin + ray.dir * SCENE_FOG_BACKGROUND);
}

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
    let fog = sky_composite_fog(frag);
    let sum = fog.scattered * (1.0 - cloud.a) + fog.transmittance * cloud.rgb;
    // O brilho como o do fundo na luz que chega (o Y do YCoCg).
    let y = min(dot(fog.scattered * (1.0 - low.a) + fog.transmittance * low.rgb, vec3f(0.25, 0.5, 0.25)), 60000.0);
    return SkyCompositeLightOut(vec4f(sum, 0.0), vec4f(y, y, 0.0, 0.0));
}

fn sky_composite_multiply(frag: vec4f) -> vec4f {
    let k = sky_composite_cloud(vec2u(frag.xy)).a;
    if (k > 1.0 - SKY_COMPOSITE_EPS) { discard; }
    return vec4f(vec3f(k), 1.0);
}

fn sky_composite_add(frag: vec4f) -> vec4f {
    let cloud = sky_composite_cloud(vec2u(frag.xy));
    let white = max(max(sky.sunIlluminance.r, sky.sunIlluminance.g), sky.sunIlluminance.b) / PI;
    if (cloud.a > 1.0 - SKY_COMPOSITE_EPS && all(cloud.rgb < vec3f(SKY_COMPOSITE_EPS * white))) {
        // Nenhuma nuvem no pixel (abaixo da precisão): a névoa já está na cor.
        discard;
    }
    let fog = sky_composite_fog(frag);
    let sum = fog.scattered * (1.0 - cloud.a) + fog.transmittance * cloud.rgb;
    if (all(sum < vec3f(SKY_COMPOSITE_EPS * white))) { discard; }
    return vec4f(sum, 0.0);
}

@fragment
fn sky_composite_multiply_fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    return sky_composite_multiply(frag);
}

@fragment
fn sky_composite_add_fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    return sky_composite_add(frag);
}
