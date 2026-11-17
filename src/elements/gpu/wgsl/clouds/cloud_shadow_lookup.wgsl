// Transmitância das nuvens até o sol num ponto da cena (spec 041, R11): o mapa visto do sol (projeção ortográfica
// centrada na câmera) — por texel a profundidade ótica acumulada ao fim de cada quarto do primeiro trecho da casca ao
// longo do raio que desce do sol — lido com filtro (a borda da sombra é suave). O trecho da coluna do ponto é recalculado
// pela casca; τ é linear entre os nós; `T(p) = exp(−τ(p))`. Fora do mapa, a borda dele.
// Requer: cloud_common, clouds, cloud_shadow_tex, cloud_clamp_sampler.

fn cloud_shadow_transmittance(p: vec3f) -> f32 {
    let sun = clouds.sunDir.xyz;
    let rel = p - clouds.sunFrame.xyz;
    let uv = vec2f(dot(rel, clouds.sunRight.xyz), dot(rel, clouds.sunUp.xyz)) / clouds.sunFrame.w + 0.5;
    let d = clouds.sunRight.w - dot(rel, sun);
    let segs = cloud_shell_segments(p + sun * d, -sun, 1e9);
    if (segs.y <= segs.x) { return 1.0; }
    let knots = textureSampleLevel(cloud_shadow_tex, cloud_clamp_sampler, uv, 0.0);
    let s = clamp((d - segs.x) / (segs.y - segs.x), 0.0, 1.0) * 4.0;
    let k = min(u32(floor(s)), 3u);
    let lo = select(knots[max(k, 1u) - 1u], 0.0, k == 0u);
    return exp(-mix(lo, knots[k], s - f32(k)));
}
