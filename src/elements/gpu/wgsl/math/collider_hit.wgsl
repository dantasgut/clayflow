// Fronteira genérica de colisão (spec 030; spec 010): distância com sinal até a superfície (negativa dentro) e normal
// de mundo apontando para fora. Os colliders (plano, caixa, esfera, superfície) e os planos do domínio respondem por ela.

struct ColliderHit {
    dist:   f32,
    normal: vec3f,
}
