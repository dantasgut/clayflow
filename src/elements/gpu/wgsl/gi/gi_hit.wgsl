// Material no ponto atingido por um raio (spec 033, R3): o mesmo fechamento do desenho — as constantes do
// `StandardMaterial` da entidade (copiadas na instância pela estrutura de raios) e, quando ela tem uma função
// `material`, a função (pelo índice dela na composição da cena, `gi_hit_material`, com os parâmetros do slot da função).
// A amostra de superfície traz o ponto, a normal interpolada, o uv e o tempo; a geometria diferencial fica zerada (as
// funções que dependem dela ou das derivadas de tela valem só no desenho). Entidade sem `StandardMaterial`: cinza médio
// fosco.
// Requer: ray_scene, ray_bvh_read, gi, material_point_types, closure, gi_hit_material.

fn gi_hit_closure(hit: RayHit) -> Closure {
    let inst = ray_instance_at(ray_scene_info.instanceFirst + hit.instance * RAY_INSTANCE_WORDS);
    let m = StandardMaterial(vec4f(inst.material0.rgb, 1.0), inst.material0.w, bitcast<f32>(inst.material1.x), 0.0, 0.0);
    let s = SurfaceSample(hit.position, hit.normal, hit.uv, gi.extra.w, vec3f(0.0), vec4f(0.0), vec3f(0.0));
    return gi_hit_material(inst.ids.w & 0xFFFFu, s, m, inst.material1.y);
}
