// Material no ponto atingido por um raio (spec 033 R3, módulo comum na spec 034): o mesmo fechamento do desenho — as
// constantes do `StandardMaterial` da entidade (copiadas na instância pela estrutura de raios) e, quando ela tem uma
// função `material`, a função (pelo índice dela na composição da cena, `ray_hit_material`, com os parâmetros do slot
// da função). A amostra de superfície traz o ponto, a normal interpolada, o uv, o tempo simulado de quem traça e a
// largura do cone do raio no ponto (`width`, metros; 0 = sem filtragem) com as derivadas do uv pela densidade do uv no
// triângulo (isotrópicas) — os nós da biblioteca filtram por elas (spec 034, H6); a geometria diferencial fica zerada
// (as funções que dependem dela ou das derivadas de tela cruas valem só no desenho).
// Entidade sem `StandardMaterial`: cinza médio fosco. Quem consome: a iluminação global, os fótons e a refração.
// Requer: ray_scene, ray_bvh_read, material_point_types, closure, ray_hit_material.

/**
 * O material no acerto antes de avaliado: o índice da função `material` na composição (0 = as constantes), o slot dos
 * parâmetros dela, a amostra de superfície e as constantes do `StandardMaterial` — quem acha acertos de mais de um tipo
 * (a refração: malhas e volumes) junta as referências e avalia `ray_hit_material` uma vez só (cada chamada é expandida
 * pelo compilador com todas as funções da cena).
 */
struct RayHitSurface {
    index: u32,
    slot: u32,
    sample: SurfaceSample,
    material: StandardMaterial,
}

/** A referência do material no acerto de malha `hit` (tempo simulado `time`, largura do cone `width`). */
fn ray_hit_surface(hit: RayHit, time: f32, width: f32) -> RayHitSurface {
    let inst = ray_instance_at(ray_scene_info.instanceFirst + hit.instance * RAY_INSTANCE_WORDS);
    let m = StandardMaterial(vec4f(inst.material0.rgb, 1.0), inst.material0.w, bitcast<f32>(inst.material1.x), 0.0, 0.0);
    let duv = select(0.0, width * ray_scene_uv_density(hit), width > 0.0);
    let s = SurfaceSample(
        hit.position,
        hit.normal,
        hit.uv,
        time,
        vec3f(0.0),
        vec4f(0.0),
        vec3f(0.0),
        width,
        vec2f(duv, 0.0),
        vec2f(0.0, duv),
    );
    return RayHitSurface(inst.ids.w & 0xFFFFu, inst.material1.y, s, m);
}

fn ray_hit_closure(hit: RayHit, time: f32, width: f32) -> Closure {
    let s = ray_hit_surface(hit, time, width);
    return ray_hit_material(s.index, s.sample, s.material, s.slot);
}
