// Fase das gotículas (spec 041, R8): a aproximação de Mie de Jendersie & d'Eon (2023) — `(1 − w_D)·HG(g_HG) +
// w_D·Draine(g_D, α)` com os parâmetros do diâmetro (Eq. 4–7, empacotados no uniforme) e as anisotropias × `g_scale`
// nas oitavas do espalhamento múltiplo.
// Requer: constants, clouds.

fn cloud_hg(c: f32, g: f32) -> f32 {
    let d = max(1.0 + g * g - 2.0 * g * c, 1e-8);
    return (1.0 - g * g) / (4.0 * PI * d * sqrt(d));
}

fn cloud_draine(c: f32, g: f32, alpha: f32) -> f32 {
    return cloud_hg(c, g) * (1.0 + alpha * c * c) / (1.0 + alpha * (1.0 + 2.0 * g * g) / 3.0);
}

fn cloud_phase(c: f32, g_scale: f32) -> f32 {
    let p = clouds.phase;
    return (1.0 - p.w) * cloud_hg(c, p.x * g_scale) + p.w * cloud_draine(c, p.y * g_scale, p.z);
}

/** A fase truncada (o pico de frente a menos de `acos(clouds.phaseCut.x)` tratado como transmitido, δ-M), normalizada
 * sem o núcleo: zero no núcleo. */
fn cloud_phase_truncated(c: f32) -> f32 {
    let cut = clouds.phaseCut;
    if (c > cut.x) { return 0.0; }
    return cloud_phase(c, 1.0) / (1.0 - cut.y);
}
