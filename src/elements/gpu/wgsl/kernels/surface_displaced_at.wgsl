// Ponto deslocado de uma superfície paramétrica (spec 011): o de `surface_frame` movido ao longo da normal pela altura do
// ponto `displacement` (zero sem `DisplacementFunction`: o mesmo ponto de `surface_at`), depois o espaço da cena. A
// função recebe a amostra de superfície do ponto `material` (`SurfaceSample`) preenchida para o vértice: o uv
// normalizado (`su`, `sv`), a posição e a normal locais, as tangentes do uv (∂posição/∂uv) e, no lugar das derivadas de
// tela, o passo da malha no uv (`spacing`) — a largura que filtra os padrões: o detalhe menor que o passo da malha não
// vira geometria (continua na normal do material, que filtra pela largura do pixel). A normal gravada é a da superfície
// sem o deslocamento: a inclinação do relevo é do material (`surface.reliefNormal`, do mesmo relevo), em todas as
// frequências até o pixel.
// Requer: surface_at (surface_frame); displacement (ponto); surface_sample; o uniforme `surface_params`.

fn surface_displaced_at(u: f32, v: f32, su: f32, sv: f32, spacing: vec2f, time: f32, data: SurfaceFnParams,
    fallback: vec3f) -> SurfaceAt {
    let f = surface_frame(u, v, sv, time, data, fallback);
    var s: SurfaceSample;
    s.world_position = f.position;
    s.normal = f.normal;
    s.uv = vec2f(su, sv);
    s.time = time;
    s.duvdx = vec2f(spacing.x, 0.0);
    s.duvdy = vec2f(0.0, spacing.y);
    s.dpdu = f.du * (surface_params.u1 - surface_params.u0);
    s.dpdv = f.dv * (surface_params.v1 - surface_params.v0);
    s.footprint = max(length(s.dpdu) * spacing.x, length(s.dpdv) * spacing.y);
    let h = displacement_fn(s, displacement_fn_params(surface_params.displacement_slot));
    let p = f.position + f.normal * select(0.0, h, abs(h) < 1e30);
    let x = space_map(p, time);
    let m = space_normal(f.position, time, f.normal);
    return SurfaceAt(x, m, finite3(x) && finite3(m));
}
