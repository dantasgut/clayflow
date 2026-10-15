// Tangentes de uma superfície pelas derivadas analíticas da função (spec 009): `surface_du` e `surface_dv`. Toma o
// lugar de `surface_tangents_numeric` quando a `SurfaceFunction` as define.
// Requer: surface_fn (ponto, com surface_du e surface_dv).

fn surface_tangents(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> mat2x3f {
    return mat2x3f(surface_du(u, v, time, data), surface_dv(u, v, time, data));
}
