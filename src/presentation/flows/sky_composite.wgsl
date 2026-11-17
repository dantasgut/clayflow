// Composição do céu na tela (spec 041, R13): um triângulo de tela cheia depois da água, antes da resolução temporal,
// com `Sky` na cena. Em cada pixel, com `(Sa, Ta)` a perspectiva aérea até a superfície (a tabela 32³; o fundo é a
// superfície no infinito: a atmosfera já está na vista do céu, `Sa = 0`, `Ta = 1`), `(Sc, Tc)` a nuvem aumentada (já
// marchada até a superfície e com a perspectiva aérea até ela; `(0, 1)` sem `CloudLayer`) e `(Sfog, Tfog)` a névoa dos
// froxels até a superfície (`scene_fog`), tudo atrás da névoa:
//   final = cor·Tc·Ta + Sfog·(1 − Tc·Ta) + Tfog·(Sc + Tc·Sa)
// (a cor da cena já é `Sfog + Tfog·L`). Dois passes com mistura do hardware: o produto `cor·(Tc·Ta)` por canal
// (`sky_composite_multiply_fs`, mistura `dst·src`) e a soma do resto (`sky_composite_add_fs`, mistura `src + dst`).
// Requer: refraction_screen (o triângulo), sky_composite_cloud, sky_aerial_lookup, camera_space, scene_fog, sky,
// cameras, sky_composite_depth.

struct SkyCompositeTerms {
    product: vec3f,
    sum: vec3f,
}

fn sky_composite_terms(frag: vec4f) -> SkyCompositeTerms {
    let px = vec2i(frag.xy);
    let size = vec2f(sky_composite_depth_size());
    let slot = sky.cameraSlot;
    let ray = camera_ray(slot, vec2f(px) + 0.5, size);
    let z = sky_composite_depth(px);
    let cam = cameras[slot];
    var aerial = SkyAerial(vec3f(0.0), vec3f(1.0));
    var p = ray.origin + ray.dir * 1e5;
    if (z < 1.0) {
        let w = cam.inverseUnjitteredViewProjection * vec4f(pixel_to_ndc(vec2f(px) + 0.5, size), z, 1.0);
        p = w.xyz / w.w;
        aerial = sky_aerial((vec2f(px) + 0.5) / size, ray.dir, length(p - cam.position.xyz));
    }
    let cloud = sky_composite_cloud(vec2u(px));
    let fog = scene_fog(p);
    let sa = aerial.scattered * sky.sunIlluminance.rgb;
    let k = cloud.a * aerial.transmittance;
    return SkyCompositeTerms(k, fog.rgb * (1.0 - k) + fog.a * (cloud.rgb + cloud.a * sa));
}

// O pixel em que a composição não muda nada (produto 1 e soma 0 exatos: o céu sem nuvem nem névoa) não escreve — o
// custo da passagem é a banda de ler e escrever a cor.
@fragment
fn sky_composite_multiply_fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let t = sky_composite_terms(frag);
    if (all(t.product == vec3f(1.0))) { discard; }
    return vec4f(t.product, 1.0);
}

@fragment
fn sky_composite_add_fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let t = sky_composite_terms(frag);
    if (all(t.sum == vec3f(0.0))) { discard; }
    return vec4f(t.sum, 0.0);
}
