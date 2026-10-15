// Jato da superfície (spec 010), pronto do lugar `surface_jet`: primeiras pelo lugar `surface_tangents`, segundas por
// diferenças centrais. O `SurfaceFlow` troca este módulo pelo analítico (função com as segundas derivadas), pelo das
// superfícies prontas ou pelo do mapa composto (espaço na cena).
// Requer: surface_jet_common.

fn surface_jet(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> SurfaceJet {
    return surface_jet_of_function(u, v, time, data);
}
