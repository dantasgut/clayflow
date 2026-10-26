// O material da água num acerto do campo dos fluidos (spec 034, T065d), comum à contribuição ao ponto
// `ray_volume_surface` e à absorção dos trechos (`ray_volume_transmittance`): a função `material` do corpo (`FluidBody`
// com `MaterialFunction`, a aparência pelo grafo) pelo índice dela na composição dos acertos dos raios e o slot dos
// parâmetros (quem avalia chama `ray_hit_material`, a mesma das malhas); sem ela, `field_surface_fallback` — o pronto
// (nenhum) ou, com corpos de `FluidSurfaceMaterial` na cena, o fechamento dele (`field_surface_fluid.wgsl`: o pool só
// existe com eles, e a ligação ausente deixaria o kernel sem compor).
// Requer: ray_volume_types, fields, closure, field_surface_fallback.

/** O material no acerto `hit` do campo (o corpo em `hit.material`). */
fn field_surface(hit: RayVolumeHit) -> RayVolumeSurface {
    let body = field_body(hit.material);
    if (body.x > 0u) { return RayVolumeSurface(body.x, body.y, closure_zero()); }
    return field_surface_fallback(body);
}
