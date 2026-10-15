// Função pronta do ponto `surface` (spec 009): as superfícies do motor, escolhidas por `surface_params.preset` com os
// valores `preset_a` — plano (v, 0, u); esfera de raio a.x (u = longitude, v = colatitude); toro de raios a.x e a.y;
// terreno por ruído (altura a.x · ruído(escala a.y · (u, v)), a.z oitavas). Normal = du × dv para fora (para cima no
// plano e no terreno). Uma `SurfaceFunction` toma o lugar deste módulo com a mesma assinatura:
//   fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f
// e, opcionais, as derivadas analíticas `surface_du`/`surface_dv` (mesma assinatura).
// Requer: structs SurfaceParams, SurfaceFnRecord; noise; o uniforme `surface_params` do kernel.

struct SurfaceFnParams {
    _unused: u32,
}

fn surface_fn_params(r: SurfaceFnRecord) -> SurfaceFnParams {
    return SurfaceFnParams(0u);
}

fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    let a = surface_params.preset_a;
    switch surface_params.preset {
        case 1u: {
            return a.x * vec3f(sin(v) * cos(u), cos(v), sin(v) * sin(u));
        }
        case 2u: {
            let ring = a.x + a.y * cos(v);
            return vec3f(ring * cos(u), -a.y * sin(v), ring * sin(u));
        }
        case 3u: {
            var h = 0.0;
            var amp = 1.0;
            var freq = a.y;
            for (var o = 0u; o < max(u32(a.z), 1u); o++) {
                h += amp * gradient_noise2(vec2f(u, v) * freq);
                amp *= 0.5;
                freq *= 2.0;
            }
            return vec3f(v, a.x * h, u);
        }
        default: {
            return vec3f(v, 0.0, u);
        }
    }
}
