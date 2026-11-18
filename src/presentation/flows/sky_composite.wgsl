// Composição do céu na tela (spec 041, R13): um triângulo de tela cheia depois da água, antes da resolução temporal,
// com `Sky` na cena. Em cada pixel, com `(Sa, Ta)` a perspectiva aérea até a superfície (a tabela 32³; o fundo é a
// superfície no infinito: a atmosfera já está na vista do céu, `Sa = 0`, `Ta = 1`), `(Sc, Tc)` a nuvem aumentada (já
// marchada até a superfície e com a perspectiva aérea até ela; `(0, 1)` sem `CloudLayer`) e `(Sfog, Tfog)` a névoa dos
// froxels até a superfície (`scene_fog`), tudo atrás da névoa:
//   final = cor·Tc·Ta + Sfog·(1 − Tc·Ta) + Tfog·(Sc + Tc·Sa)
// (a cor da cena já é `Sfog + Tfog·L`). Dois passes com mistura do hardware: o produto `cor·(Tc·Ta)` por canal
// (`sky_composite_multiply_fs`, mistura `dst·src`) e a soma do resto (`sky_composite_add_fs`, mistura `src + dst`).
// Com o alvo da luz que chega (sem MSAA, a resolução temporal), as mesmas misturas no brilho dele (`*_light_fs`): no fundo
// a luz é a radiância, e a composta fica igual ao brilho da cor composta (spec 041).
// Requer: refraction_screen (o triângulo), sky_composite_cloud, sky_aerial_lookup, camera_space, scene_fog, sky,
// cameras, constants, sky_composite_depth, color.

/** O ponto da superfície do pixel, a direção e a perspectiva aérea até ele (o fundo: no infinito, `(0, 1)`). */
struct SkyCompositeSurface {
    p: vec3f,
    aerial: SkyAerial,
}

fn sky_composite_surface(frag: vec4f) -> SkyCompositeSurface {
    let px = vec2i(frag.xy);
    let size = vec2f(sky_composite_depth_size());
    let slot = sky.cameraSlot;
    let ray = camera_ray(slot, vec2f(px) + 0.5, size);
    let z = sky_composite_depth(px);
    let cam = cameras[slot];
    var out = SkyCompositeSurface(ray.origin + ray.dir * 1e5, SkyAerial(vec3f(0.0), vec3f(1.0)));
    if (z < 1.0) {
        let w = cam.inverseUnjitteredViewProjection * vec4f(pixel_to_ndc(vec2f(px) + 0.5, size), z, 1.0);
        out.p = w.xyz / w.w;
        out.aerial = sky_aerial((vec2f(px) + 0.5) / size, ray.dir, length(out.p - cam.position.xyz));
    }
    return out;
}

// O pixel em que a composição não muda a cor guardada não escreve — o custo da passagem é a banda de ler e escrever a
// cor. O produto: `1 − k < 2⁻¹²` é menos de meio ULP do `rgba16float` (11 bits de mantissa): a cor arredondada não muda.
// A soma: abaixo de 2⁻¹² da radiância de uma superfície branca ao sol (E/π), a escala que a exposição da cena mostra.
// O produto não lê a névoa (só a soma precisa dela).
const SKY_COMPOSITE_EPS: f32 = 1.0 / 4096.0;
fn sky_composite_multiply(frag: vec4f) -> vec4f {
    let k = sky_composite_cloud(vec2u(frag.xy)).a * sky_composite_surface(frag).aerial.transmittance;
    if (all(k > vec3f(1.0 - SKY_COMPOSITE_EPS))) { discard; }
    return vec4f(k, 1.0);
}

@fragment
fn sky_composite_multiply_fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    return sky_composite_multiply(frag);
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
    return SkyCompositeLightOut(k, vec2f(select(1.0, ycocg(k.rgb).x, sky_composite_background(frag))));
}

@fragment
fn sky_composite_add_light_fs(@builtin(position) frag: vec4f) -> SkyCompositeLightOut {
    let sum = sky_composite_add(frag);
    return SkyCompositeLightOut(sum, vec2f(select(0.0, ycocg(sum.rgb).x, sky_composite_background(frag))));
}

@fragment
fn sky_composite_add_fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    return sky_composite_add(frag);
}

fn sky_composite_add(frag: vec4f) -> vec4f {
    let surface = sky_composite_surface(frag);
    let cloud = sky_composite_cloud(vec2u(frag.xy));
    let k = cloud.a * surface.aerial.transmittance;
    let sa = surface.aerial.scattered * sky.sunIlluminance.rgb;
    let x = cloud.rgb + cloud.a * sa;
    let white = max(max(sky.sunIlluminance.r, sky.sunIlluminance.g), sky.sunIlluminance.b) / PI;
    if (all(k > vec3f(1.0 - SKY_COMPOSITE_EPS)) && all(x < vec3f(SKY_COMPOSITE_EPS * white))) {
        // A nuvem e a atmosfera no pixel abaixo da precisão: a névoa já está na cor.
        discard;
    }
    let fog = scene_fog(surface.p);
    let sum = fog.rgb * (1.0 - k) + fog.a * x;
    if (all(sum < vec3f(SKY_COMPOSITE_EPS * white))) { discard; }
    return vec4f(sum, 0.0);
}
