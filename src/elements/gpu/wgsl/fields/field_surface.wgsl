// O material da água num acerto do campo dos fluidos (spec 034, T065d), comum à contribuição ao ponto
// `ray_volume_surface` e à absorção dos trechos (`ray_volume_transmittance`): a função `material` do corpo (`FluidBody`
// com `MaterialFunction`, a aparência pelo grafo) pelo índice dela na composição dos acertos dos raios e o slot dos
// parâmetros (quem avalia chama `ray_hit_material`, a mesma das malhas); sem corpo, nenhum.
// Requer: ray_volume_types, fields, closure.

/** O material no acerto `hit` do campo (o corpo em `hit.material`). */
fn field_surface(hit: RayVolumeHit) -> RayVolumeSurface {
    let body = field_body(hit.material);
    return RayVolumeSurface(body.x, body.y, closure_zero());
}
