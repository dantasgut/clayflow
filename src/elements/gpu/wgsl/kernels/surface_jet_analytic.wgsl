// Jato da superfície pelas derivadas analíticas da função (spec 010): `surface_du`, `surface_dv`, `surface_duu`,
// `surface_duv`, `surface_dvv`. Toma o lugar de `surface_jet_numeric` quando a `SurfaceFunction` define as cinco.
// Requer: surface_jet_common; surface_fn (ponto, com as derivadas).

fn surface_jet(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> SurfaceJet {
    return SurfaceJet(
        surface_fn(u, v, time, data),
        surface_du(u, v, time, data),
        surface_dv(u, v, time, data),
        surface_duu(u, v, time, data),
        surface_duv(u, v, time, data),
        surface_dvv(u, v, time, data),
    );
}
