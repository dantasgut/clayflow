// Ponto de uma superfície paramétrica em (u, v) (spec 010): posição por `surface_fn`, normal du × dv pelas tangentes do
// ponto `surface_tangents` (recuo para dentro do domínio em v quando degeneram — polos), e o espaço da cena
// (`space_map`/`space_normal`, identidade sem `SpaceFunction`). Um único código de avaliação para a malha uniforme, a
// adaptativa e o colisor. `sv` é a coordenada normalizada em v (decide o lado do recuo); `fallback` é a normal usada
// quando a calculada não é finita; `finite` é falso quando o ponto ou a normal no espaço não são finitos.
// `surface_frame` é a parte local (antes do espaço): o ponto, a normal e as tangentes ∂/∂u e ∂/∂v — o que o deslocamento
// (`surface_displaced_at`, spec 011) usa.
// Requer: surface_fn (ponto); surface_tangents; space (ponto); o uniforme `surface_params` do kernel.

struct SurfaceAt {
    position: vec3f,
    normal: vec3f,
    finite: bool,
}

struct SurfaceFrame {
    position: vec3f,
    normal: vec3f,
    du: vec3f,
    dv: vec3f,
}

fn surface_frame(u: f32, v: f32, sv: f32, time: f32, data: SurfaceFnParams, fallback: vec3f) -> SurfaceFrame {
    let p = surface_fn(u, v, time, data);
    var t = surface_tangents(u, v, time, data);
    var raw = cross(t[0], t[1]);
    // Tangentes degeneradas (polo: uma delas some diante da outra — em f32 com o sinal do resto da conta): as de um
    // pouco para dentro do domínio em v.
    let lu = length(t[0]);
    let lv = length(t[1]);
    if (min(lu, lv) <= 1e-4 * max(lu, lv) || length(raw) <= 1e-12) {
        let inward = select(-1.0, 1.0, sv < 0.5) * sign(surface_params.v1 - surface_params.v0);
        t = surface_tangents(u, v + inward * surface_params.h_v, time, data);
        raw = cross(t[0], t[1]);
    }
    let len = length(raw);
    var n = fallback;
    if (len > 1e-12 && finite3(raw)) { n = raw / len; }
    return SurfaceFrame(p, n, t[0], t[1]);
}

fn surface_at(u: f32, v: f32, sv: f32, time: f32, data: SurfaceFnParams, fallback: vec3f) -> SurfaceAt {
    let f = surface_frame(u, v, sv, time, data, fallback);
    let x = space_map(f.position, time);
    let m = space_normal(f.position, time, f.normal);
    return SurfaceAt(x, m, finite3(x) && finite3(m));
}
