// Cor (spec 005, R7): exposição, codificação gama e luminância usadas pelo pós-processamento.

// Mapeamento de tons por exposição: 1 − e^(−c·exposição).
fn tonemap_exposure(c: vec3f, exposure: f32) -> vec3f {
    return vec3<f32>(1.0) - exp(-c * exposure);
}

// Codificação gama: c^(1/γ).
fn gamma_encode(c: vec3f, gamma: f32) -> vec3f {
    return pow(c, vec3<f32>(1.0 / gamma));
}

// Luminância com os pesos BT.601 (os que o pós-processamento usa).
fn luminance(c: vec3f) -> f32 {
    return dot(c, vec3<f32>(0.299, 0.587, 0.114));
}
