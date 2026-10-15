// Tangentes de uma superfície por diferenças centrais (spec 009): passo `surface_params.h_u`/`h_v` (fração do domínio).
// O `SurfaceFlow` troca este módulo por `surface_tangents_analytic` quando a função define as derivadas.
// Requer: surface_fn (ponto); o uniforme `surface_params` do kernel.

fn surface_tangents(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> mat2x3f {
    let hu = surface_params.h_u;
    let hv = surface_params.h_v;
    let du = (surface_fn(u + hu, v, time, data) - surface_fn(u - hu, v, time, data)) / (2.0 * hu);
    let dv = (surface_fn(u, v + hv, time, data) - surface_fn(u, v - hv, time, data)) / (2.0 * hv);
    return mat2x3f(du, dv);
}
