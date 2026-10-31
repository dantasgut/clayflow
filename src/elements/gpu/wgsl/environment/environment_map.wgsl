// A imagem do mundo (spec 039 refeita, `EnvironmentMap`): a radiância da panorâmica equirretangular na direção `dir`
// (unitária, mundo) — a coluna pelo azimute em volta do eixo y (girado de `environment.yaw`), a linha pela altura (a
// primeira linha é o zênite) —, vezes a intensidade.
// Requer: constants, environment, environment_image, environment_sampler.

fn environment_radiance(dir: vec3f) -> vec3f {
    let d = normalize(dir);
    let u = fract(atan2(d.x, -d.z) / (2.0 * PI) + 0.5 + environment.yaw / (2.0 * PI));
    let v = acos(clamp(d.y, -1.0, 1.0)) / PI;
    return textureSampleLevel(environment_image, environment_sampler, vec2f(u, v), 0.0).rgb * environment.intensity;
}
