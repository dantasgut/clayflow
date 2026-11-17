// A leitura do cache de espalhamento das nuvens (spec 041, T023, R8): a fatia do quadro da série lida filtrada — rgb a
// soma da luz dos caminhos em unidades da iluminância do sol, a quantos caminhos —, misturada à estimativa local.
// Requer: cloud_scatter_grid, sky, clouds, cloud_scatter_tex, cloud_clamp_sampler.

/**
 * A luz das sondas em `p`, misturada à estimativa `prior` (as oitavas e o ambiente local, na mesma unidade): a soma
 * filtrada dos caminhos (convertida da unidade do sol) com o peso `CLOUD_SCATTER_PRIOR` para a estimativa local. Fora da
 * grade, a estimativa local.
 */
fn cloud_scatter_light(p: vec3f, prior: vec3f) -> vec3f {
    let uvw = cloud_scatter_uvw(p);
    if (any(uvw.xz < vec2f(0.0)) || any(uvw.xz > vec2f(1.0))) { return prior; }
    let q = textureSampleLevel(cloud_scatter_tex, cloud_clamp_sampler, clamp(uvw, vec3f(0.0), vec3f(1.0)), 0.0);
    let n0 = clouds.scatterParams.x;
    return (q.rgb * sky.sunIlluminance.g + n0 * prior) / (max(q.a, 0.0) + n0);
}
