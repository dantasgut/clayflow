// Jato da superfície no espaço da cena (spec 010): todo por diferenças do mapa composto `space_map ∘ surface_fn` — as
// formas e curvaturas são as da superfície deformada que se vê. Toma o lugar de `surface_jet_numeric` com espaço na
// cena.
// Requer: surface_jet_common.

fn surface_jet(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> SurfaceJet {
    return surface_jet_of_mapped(u, v, time, data);
}
