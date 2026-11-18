// Composição das nuvens na tela (spec 041, R13): um triângulo de tela cheia depois da água, antes da resolução temporal,
// com uma `CloudLayer` na cena. A atmosfera até a superfície já está na cor (o `Sky` contribui a `scene_fog`, atrás da
// névoa dos volumes): a cor da cena é `Sfog + Tfog·(L·Ta + Sa)`. Em cada pixel, com `(Sc, Tc)` a nuvem aumentada (já
// marchada até a superfície e com a perspectiva aérea até ela) e `(Sfog, Tfog)` a névoa dos volumes, na frente da nuvem
// (R13: a névoa é perto, a nuvem longe — a névoa do fundo, `scene_fog` no infinito, sem a atmosfera, que já está no
// céu):
//   final = Sfog + Tfog·(Sc + Tc·(L·Ta + Sa)) = cor·Tc + Sfog·(1 − Tc) + Tfog·Sc
// Dois passes com mistura do hardware: o produto `cor·Tc` (`sky_composite_multiply_fs`, mistura `dst·src`) e a soma do
// resto (`sky_composite_add_fs`, mistura `src + dst`). Com o alvo da luz que chega (sem MSAA, a resolução temporal), as
// mesmas misturas no brilho dele (`*_light_fs`): no fundo a luz é a radiância, e a composta fica igual ao brilho da cor
// composta (spec 041).
// Requer: refraction_screen (o triângulo), sky_composite_cloud, camera_space, scene_fog, SCENE_FOG_BACKGROUND, sky,
// cameras, constants, sky_composite_depth, color.

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

struct SkyCompositeLightOut {
    @location(0) color: vec4f,
    @location(1) light: vec2f,
}

/** O fundo do pixel (nenhuma superfície): só nele a luz que chega é a radiância; na superfície ela não muda. */
fn sky_composite_background(frag: vec4f) -> bool {
    return sky_composite_depth(vec2i(frag.xy)) >= 1.0;
}

@fragment
fn sky_composite_multiply_light_fs(@builtin(position) frag: vec4f) -> SkyCompositeLightOut {
    let k = sky_composite_multiply(frag);
    return SkyCompositeLightOut(k, vec2f(select(1.0, k.r, sky_composite_background(frag))));
}

@fragment
fn sky_composite_add_light_fs(@builtin(position) frag: vec4f) -> SkyCompositeLightOut {
    let sum = sky_composite_add(frag);
    return SkyCompositeLightOut(sum, vec2f(select(0.0, ycocg(sum.rgb).x, sky_composite_background(frag))));
}
