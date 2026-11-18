// O pixel marchado de cada bloco 2 × 2 do alvo reconstruído no quadro (spec 041, R1) e a escala desse alvo.
// Requer: clouds.

/** O pixel do bloco 2 × 2 marchado no quadro `frame` (Bayer 2 × 2: 0, 3, 1, 2). */
fn cloud_bayer(frame: u32) -> vec2u {
    switch (frame & 3u) {
        case 0u: { return vec2u(0u, 0u); }
        case 1u: { return vec2u(1u, 1u); }
        case 2u: { return vec2u(1u, 0u); }
        default: { return vec2u(0u, 1u); }
    }
}

/**
 * Pixels da tela por lado de um texel do alvo reconstruído (`clouds.timing.z`, pelo perfil: 2 — ¼ da tela —, 4 no
 * baixo — 1/16): a marcha anda um texel por bloco 2 × 2 dele.
 */
fn cloud_march_scale() -> u32 {
    return clamp(u32(clouds.timing.z), 2u, 4u);
}
