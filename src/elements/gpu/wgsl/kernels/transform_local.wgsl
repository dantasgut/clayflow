// Matriz local de um Transform (convenção M = T · R · S) e a sua matriz de normais, compartilhada pela composição das
// raízes e pela dos níveis da hierarquia — e à mão das funções `transform` do usuário. A conta é a do TRS (`xform_trs`).
// Requer: structs Transform, WorldTransform; xform_trs.

fn transform_local(t: Transform) -> WorldTransform {
    var out: WorldTransform;
    out.world = trs_world(t.position.xyz, t.rotation, t.scale.xyz);
    out.normal = trs_normal(t.rotation, t.scale.xyz);
    return out;
}
