/**
 * Módulo WGSL: operações matriciais.
 *
 * Transformações de vetores/normais entre espaço local e mundo,
 * usadas em colisão SDF e sincronização de normais de vértice.
 */
export const WGSL_MAT = /* wgsl */`

// ── Operações matriciais ─────────────────────────────────────────────────────

// Transforma v pela parte superior 3×3 de uma mat4x4f (rotation+scale, sem translação).
// Usado para transformar normais e gradientes SDF de espaço local para mundo.
// WGSL mat4x4f é column-major: m[col][row], portanto m[col].x = elemento (row=0, col).
fn mat4_upper3x3_transform(m: mat4x4f, v: vec3f) -> vec3f {
    return vec3f(
        m[0].x*v.x + m[1].x*v.y + m[2].x*v.z,
        m[0].y*v.x + m[1].y*v.y + m[2].y*v.z,
        m[0].z*v.x + m[1].z*v.y + m[2].z*v.z,
    );
}

// Constrói uma mat3x3f de rotação pura a partir de um quaternion normalizado.
// Útil quando múltiplas transformações de vetor são necessárias para o mesmo corpo.
fn mat3_from_quat(q: vec4f) -> mat3x3f {
    let x2 = q.x*q.x; let y2 = q.y*q.y; let z2 = q.z*q.z;
    let xy = q.x*q.y; let xz = q.x*q.z; let yz = q.y*q.z;
    let wx = q.w*q.x; let wy = q.w*q.y; let wz = q.w*q.z;
    // Colunas da matriz de rotação (column-major)
    return mat3x3f(
        vec3f(1.0-2.0*(y2+z2), 2.0*(xy+wz),     2.0*(xz-wy)    ),
        vec3f(2.0*(xy-wz),     1.0-2.0*(x2+z2), 2.0*(yz+wx)    ),
        vec3f(2.0*(xz+wy),     2.0*(yz-wx),     1.0-2.0*(x2+y2)),
    );
}
`;
