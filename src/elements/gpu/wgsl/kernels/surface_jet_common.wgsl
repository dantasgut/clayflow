// Derivadas de uma superfície paramétrica até a segunda ordem (spec 010): o "jato" em (u, v) — ponto, Su, Sv, Suu, Suv,
// Svv — e os jatos por diferenças centrais que as implementações do lugar `surface_jet` usam: da função da superfície
// (as primeiras pelo lugar `surface_tangents`, analíticas quando a função as dá) e do mapa composto com o espaço da cena
// (`space_map ∘ surface_fn`: as formas são as da superfície que se vê). As segundas usam o passo 10·h (o erro de
// arredondamento de f32 cai com h², o de truncamento continua abaixo de 1e-3 relativo).
// Requer: surface_fn (ponto); surface_tangents; space (ponto); o uniforme `surface_params` do kernel.

struct SurfaceJet {
    p: vec3f,
    du: vec3f,
    dv: vec3f,
    duu: vec3f,
    duv: vec3f,
    dvv: vec3f,
}

// Jato da função da superfície: primeiras pelo lugar `surface_tangents`, segundas por diferenças.
fn surface_jet_of_function(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> SurfaceJet {
    let hu = 10.0 * surface_params.h_u;
    let hv = 10.0 * surface_params.h_v;
    let p = surface_fn(u, v, time, data);
    let t = surface_tangents(u, v, time, data);
    let duu = (surface_fn(u + hu, v, time, data) - 2.0 * p + surface_fn(u - hu, v, time, data)) / (hu * hu);
    let dvv = (surface_fn(u, v + hv, time, data) - 2.0 * p + surface_fn(u, v - hv, time, data)) / (hv * hv);
    let duv = (surface_fn(u + hu, v + hv, time, data) - surface_fn(u + hu, v - hv, time, data)
        - surface_fn(u - hu, v + hv, time, data) + surface_fn(u - hu, v - hv, time, data)) / (4.0 * hu * hv);
    return SurfaceJet(p, t[0], t[1], duu, duv, dvv);
}

// Ponto da superfície no espaço da cena.
fn surface_mapped(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return space_map(surface_fn(u, v, time, data), time);
}

// Jato do mapa composto com o espaço, todo por diferenças.
fn surface_jet_of_mapped(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> SurfaceJet {
    let h1u = surface_params.h_u;
    let h1v = surface_params.h_v;
    let hu = 10.0 * h1u;
    let hv = 10.0 * h1v;
    let p = surface_mapped(u, v, time, data);
    let du = (surface_mapped(u + h1u, v, time, data) - surface_mapped(u - h1u, v, time, data)) / (2.0 * h1u);
    let dv = (surface_mapped(u, v + h1v, time, data) - surface_mapped(u, v - h1v, time, data)) / (2.0 * h1v);
    let duu = (surface_mapped(u + hu, v, time, data) - 2.0 * p + surface_mapped(u - hu, v, time, data)) / (hu * hu);
    let dvv = (surface_mapped(u, v + hv, time, data) - 2.0 * p + surface_mapped(u, v - hv, time, data)) / (hv * hv);
    let duv = (surface_mapped(u + hu, v + hv, time, data) - surface_mapped(u + hu, v - hv, time, data)
        - surface_mapped(u - hu, v + hv, time, data) + surface_mapped(u - hu, v - hv, time, data)) / (4.0 * hu * hv);
    return SurfaceJet(p, du, dv, duu, duv, dvv);
}
