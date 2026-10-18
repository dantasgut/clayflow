// Material no ponto atingido por um raio (spec 033, R3; spec 034, R3): o mesmo fechamento do desenho — as constantes do
// `StandardMaterial` da entidade (copiadas na instância pela estrutura de raios) e, quando ela tem uma função
// `material`, a função (pelo índice dela na composição da cena, `ray_hit_material`, com os parâmetros do slot da função).
// A amostra de superfície traz o ponto, a normal interpolada, o uv e o tempo `time` de quem traça; a geometria
// diferencial fica zerada (as funções que dependem dela ou das derivadas de tela valem só no desenho). Entidade sem
// `StandardMaterial`: cinza médio fosco. Serve a quem traça raios — a luz rebatida, a refração.
// Requer: ray_common, ray_bvh_read, ray_scene_info, material_point_types, closure, ray_hit_material.

fn ray_hit_closure(hit: RayHit, time: f32) -> Closure {
    let inst = ray_instance_at(ray_scene_info.instanceFirst + hit.instance * RAY_INSTANCE_WORDS);
    let m = StandardMaterial(vec4f(inst.material0.rgb, 1.0), inst.material0.w, bitcast<f32>(inst.material1.x), 0.0, 0.0);
    let s = SurfaceSample(hit.position, hit.normal, hit.uv, time, vec3f(0.0), vec4f(0.0), vec3f(0.0));
    return ray_hit_material(inst.ids.w & 0xFFFFu, s, m, inst.material1.y);
}
