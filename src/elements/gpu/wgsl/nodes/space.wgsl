// Nós de conversão de espaço (spec 031, R12): uma matriz 4×4 (entrada do grafo: a de mundo da entidade, a vista ou a
// projeção da câmera, a inversa) aplicada a um ponto (w = 1), a uma direção (w = 0) ou a uma normal (inversa transposta
// da parte 3×3, normalizada); a inversa de uma matriz afim; a projeção com divisão perspectiva (clip → NDC). Objeto →
// mundo: a matriz de mundo; mundo → objeto: a inversa dela; mundo → vista: a vista. As contas são as da álgebra
// canônica (`xform_affine`, `xform_projective`, spec 037); o nó mantém o nome público.
// Requer: xform_rigid, xform_affine, xform_projective.

fn node_space_point(m: mat4x4f, p: vec3f) -> vec3f {
    return affine_point(m, p);
}

fn node_space_direction(m: mat4x4f, d: vec3f) -> vec3f {
    return affine_direction(m, d);
}

fn node_space_normal(m: mat4x4f, n: vec3f) -> vec3f {
    return normalize(affine_normal(m) * n);
}

fn node_space_inverse(m: mat4x4f) -> mat4x4f {
    return affine_inverse(m);
}

fn node_space_inverse_rigid(m: mat4x4f) -> mat4x4f {
    return rigid_inverse(m);
}

fn node_space_inverse_projective(m: mat4x4f) -> mat4x4f {
    return projective_inverse(m);
}

fn node_space_project(m: mat4x4f, p: vec3f) -> vec3f {
    return projective_point(m, p);
}
