// O material da água num acerto do campo dos fluidos (spec 034, T065d), comum à contribuição ao ponto
// `ray_volume_surface` e à absorção dos trechos (`ray_volume_transmittance`): a função `material` do corpo (`FluidBody`
// com `MaterialFunction`, a aparência pelo grafo) pelo índice dela na composição dos acertos dos raios e o slot dos
// parâmetros — quem traça avalia a função no acerto pela onda dos acertos (spec 039) — e o fechamento do corpo avaliado
// uma vez por quadro (`field_body_closures`: o meio homogêneo, que a absorção dos trechos lê); sem corpo, nenhum.
// Requer: ray_volume_types, fields, closure, field_body_closures.

/** O material no acerto `hit` do campo (o corpo em `hit.material`). */
fn field_surface(hit: RayVolumeHit) -> RayVolumeSurface {
    let body = field_body(hit.material);
    if (hit.material == 0u) { return RayVolumeSurface(0u, 0u, closure_zero()); }
    return RayVolumeSurface(body.x, body.y, field_body_closures[hit.material - 1u]);
}
