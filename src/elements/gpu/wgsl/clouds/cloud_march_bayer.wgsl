// O pixel marchado de cada bloco 2 × 2 do alvo de ¼ da tela no quadro (spec 041, R1).
// Requer: nada.

/** O pixel do bloco 2 × 2 marchado no quadro `frame` (Bayer 2 × 2: 0, 3, 1, 2). */
fn cloud_bayer(frame: u32) -> vec2u {
    switch (frame & 3u) {
        case 0u: { return vec2u(0u, 0u); }
        case 1u: { return vec2u(1u, 1u); }
        case 2u: { return vec2u(1u, 0u); }
        default: { return vec2u(0u, 1u); }
    }
}
