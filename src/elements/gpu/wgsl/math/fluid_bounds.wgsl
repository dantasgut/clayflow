// Limites do domínio dos fluidos de partículas (spec 010). Com o domínio aberto (`ParticlePhysics.bounds: 'open'`), os
// planos do domínio não são paredes: a partícula que sai da caixa por baixo ou pelos lados é retirada — parada muito
// abaixo da cena (fora da grade de vizinhos, do enquadramento da água e da imagem). Acima do topo ela segue (volta a
// cair).

const FLUID_RETIRED_Y: f32 = -1.0e7;

fn fluid_outside(p: vec3f, lo: vec3f, hi: vec3f) -> bool {
    return p.y < lo.y || p.x < lo.x || p.z < lo.z || p.x > hi.x || p.z > hi.z;
}

// Planos do domínio que recebem adesão: os do chão e dos lados mínimos com paredes; nenhum com o domínio aberto.
fn fluid_adhesion_min(lo: vec3f, open: u32) -> vec3f {
    return select(lo, vec3f(-3.0e38), open != 0u);
}
