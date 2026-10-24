// Vista de um produtor da superfície de água (spec 017): câmera (perspectiva ou ortográfica, matrizes do pool
// `CameraMatrices`) ou luz (matriz ortográfica do pool `ShadowMatrix`). Profundidade linear em metros ao longo da vista.

// Escala de cada eixo de uma matriz afim (ortográfica): o comprimento das linhas da parte 3×3.
fn water_affine_scale(m: mat4x4f) -> vec3f {
    return vec3f(
        length(vec3f(m[0].x, m[1].x, m[2].x)),
        length(vec3f(m[0].y, m[1].y, m[2].y)),
        length(vec3f(m[0].z, m[1].z, m[2].z)),
    );
}

