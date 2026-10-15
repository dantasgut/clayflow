// Projeção do desenho forward (spec 009): do ponto de mundo para o clip pela câmera de slot `slot` — a
// `viewProjection` da câmera. Com uma `CameraFunction` que define `camera_project` na câmera ativa, o estágio troca
// este módulo pelo adaptador da função (projeção de ponto, por vértice).
// Requer: o binding `cameras` do forward.

fn camera_clip(slot: u32, world: vec4f) -> vec4f {
    return cameras[slot].viewProjection * world;
}
