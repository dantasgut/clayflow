// A superfície física do collider mais próximo de um ponto (spec 034): a entrada dele na tabela das `SurfacePhysics`
// da cena (`collider_surfaces`, escrita pelo `ColliderSet`: 0 o padrão, k + 1 a k-ésima), na mesma ordem e com a mesma
// distância de `collider_set_distance`. Sem collider, 0.
// Requer: collider_set, collider_surfaces.

fn collider_set_surface(p: vec3f) -> u32 {
    var d = 3.0e38;
    var s = 0u;
    var base = 0u;
    for (var i = 0u; i < collider_counts.plane_count; i++) {
        let e = collider_hit_plane(i, p).dist;
        if (e < d) { d = e; s = collider_surfaces[base + i]; }
    }
    base += collider_counts.plane_count;
    for (var i = 0u; i < collider_counts.box_count; i++) {
        let e = collider_hit_box(i, p).dist;
        if (e < d) { d = e; s = collider_surfaces[base + i]; }
    }
    base += collider_counts.box_count;
    for (var i = 0u; i < collider_counts.sphere_count; i++) {
        let e = collider_hit_sphere(i, p).dist;
        if (e < d) { d = e; s = collider_surfaces[base + i]; }
    }
    base += collider_counts.sphere_count;
    for (var i = 0u; i < collider_counts.surface_count; i++) {
        let first = surface_collider_first(i);
        let e = collider_hit_surface(first, p).dist - surface_collider_margin(first);
        if (e < d) { d = e; s = collider_surfaces[base + i]; }
    }
    return s;
}
