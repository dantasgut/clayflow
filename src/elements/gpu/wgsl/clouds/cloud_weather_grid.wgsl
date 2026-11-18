// O quadrado do tempo das nuvens (spec 041, R18): centrado na câmera, encaixado no texel dele (lado
// `clouds.weatherMap.z` em `clouds.weatherMap.y` texels). O centro é calculado aqui, da posição da câmera — o de agora
// pela vista e o do quadro em que a fatia anterior da série foi escrita pela vista anterior —, a mesma conta nos dois
// lados (a série lida no lugar em que foi escrita, sem estado fora da 037).
// Requer: clouds, cameras, xform_rigid.

/** Lado (m) de um texel do quadrado do tempo. */
fn cloud_weather_texel() -> f32 {
    return clouds.weatherMap.z / clouds.weatherMap.y;
}

/** O centro do quadrado para a câmera em `eye`. */
fn cloud_weather_center(eye: vec3f) -> vec2f {
    let s = cloud_weather_texel();
    return floor(eye.xz / s + 0.5) * s;
}

/** O centro de agora e o do quadro anterior. */
fn cloud_weather_center_now() -> vec2f {
    return cloud_weather_center(rigid_inverse(cameras[clouds.march.w].view)[3].xyz);
}

fn cloud_weather_center_before() -> vec2f {
    return cloud_weather_center(rigid_inverse(cameras[clouds.march.w].previousView)[3].xyz);
}

/** As coordenadas [0, 1]² do ponto `xz` (m) no quadrado de centro `center`. */
fn cloud_weather_uv(xz: vec2f, center: vec2f) -> vec2f {
    return (xz - center) / clouds.weatherMap.z + 0.5;
}
