// Apresentação (spec 011, R1/R2): do HDR linear à tela. `present_map` aplica a exposição e o operador (linear de
// exibição); `present_output` codifica (sRGB, ou sRGB estendido na saída HDR) e pontilha a saída de 8 bits.
// Struct `PresentationParams` gerado do schema: `toneOperator` (0 AgX, 1 ACES, 2 neutro, 3 linear), `exposure` (2^EV),
// `dither` (0/1), `output` (0 padrão, 1 HDR estendido).

fn present_map(c: vec3f) -> vec3f {
    let e = max(c, vec3f(0.0)) * presentation.exposure;
    if (presentation.output == 1u) { return e; }
    switch (presentation.toneOperator) {
        case 0u: { return tonemap_agx(e); }
        case 1u: { return tonemap_aces(e); }
        case 2u: { return tonemap_neutral(e); }
        default: { return clamp(e, vec3f(0.0), vec3f(1.0)); }
    }
}

fn present_output(mapped: vec3f, pixel: vec2u) -> vec4f {
    if (presentation.output == 1u) { return vec4f(srgb_encode_extended(mapped), 1.0); }
    let encoded = srgb_encode(mapped);
    let dithered = select(encoded, present_dither(encoded, pixel), presentation.dither != 0u);
    return vec4f(dithered, 1.0);
}
