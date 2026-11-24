// Composição do reflexo traçado dos opacos lisos (spec 011, T114): um triângulo de tela cheia sobre a cor da cena,
// depois do traçado, em mistura aditiva. No pixel com pedido de reflexo, soma a radiância que o raio refletido achou
// (`refraction_radiance`) pelo peso do lobo liso (`refraction_reflectance`, com a névoa até o ponto) — a parte da
// especular indireta que o desenho deixou de fora (`CLOSURE_TRACED`). Sem pedido de reflexo, nada muda.
// Requer: refraction_screen, refraction, REFRACTION_REQUEST_VALID, REFRACTION_REQUEST_REFLECT, refraction_request,
// refraction_radiance, refraction_reflectance.

@fragment
fn refraction_reflection_fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let px = vec2u(frag.xy);
    let marks = textureLoad(refraction_request, px, 0).y;
    let reflect = REFRACTION_REQUEST_VALID | REFRACTION_REQUEST_REFLECT;
    if (refraction.reflection == 0u || (marks & reflect) != reflect) { discard; }
    return vec4f(textureLoad(refraction_reflectance, px, 0).rgb * textureLoad(refraction_radiance, px, 0).rgb, 0.0);
}
