// Jato das superfícies prontas (spec 010): derivadas analíticas do plano, da esfera e do toro (os mesmos parâmetros de
// `surface_fn_ready`); o terreno por ruído usa diferenças. Toma o lugar de `surface_jet_numeric` quando a superfície não
// tem função própria nem espaço na cena.
// Requer: surface_jet_common; o uniforme `surface_params` do kernel.

fn surface_jet(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> SurfaceJet {
    let a = surface_params.preset_a;
    let p = surface_fn(u, v, time, data);
    switch surface_params.preset {
        case 1u: {
            let su = sin(u);
            let cu = cos(u);
            let sv = sin(v);
            let cv = cos(v);
            return SurfaceJet(
                p,
                a.x * vec3f(-sv * su, 0.0, sv * cu),
                a.x * vec3f(cv * cu, -sv, cv * su),
                a.x * vec3f(-sv * cu, 0.0, -sv * su),
                a.x * vec3f(-cv * su, 0.0, cv * cu),
                a.x * vec3f(-sv * cu, -cv, -sv * su),
            );
        }
        case 2u: {
            let su = sin(u);
            let cu = cos(u);
            let sv = sin(v);
            let cv = cos(v);
            let ring = a.x + a.y * cv;
            return SurfaceJet(
                p,
                vec3f(-ring * su, 0.0, ring * cu),
                vec3f(-a.y * sv * cu, -a.y * cv, -a.y * sv * su),
                vec3f(-ring * cu, 0.0, -ring * su),
                vec3f(a.y * sv * su, 0.0, -a.y * sv * cu),
                vec3f(-a.y * cv * cu, a.y * sv, -a.y * cv * su),
            );
        }
        case 3u: {
            return surface_jet_of_function(u, v, time, data);
        }
        default: {
            return SurfaceJet(p, vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), vec3f(0.0), vec3f(0.0), vec3f(0.0));
        }
    }
}
