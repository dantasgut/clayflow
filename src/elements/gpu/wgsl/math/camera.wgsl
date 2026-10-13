// Câmera (spec 007, research R10): projeções perspectiva e ortográfica e a vista a partir da matriz de mundo da
// câmera. Convenção de clip z em [−1, 1] (a dos controllers e do bench antes da 007; a de [0, 1] do WebGPU é da F4).
// Requer `mat`.

// Perspectiva: campo de visão vertical `fov` (rad), razão `aspect`, planos `near`/`far`.
fn camera_perspective(fov: f32, aspect: f32, near: f32, far: f32) -> mat4x4f {
    let f = 1.0 / tan(fov * 0.5);
    let nf = 1.0 / (near - far);
    return mat4x4f(
        vec4f(f / aspect, 0.0, 0.0, 0.0),
        vec4f(0.0, f, 0.0, 0.0),
        vec4f(0.0, 0.0, (far + near) * nf, -1.0),
        vec4f(0.0, 0.0, 2.0 * far * near * nf, 0.0),
    );
}

// Ortográfica: altura visível `height`, razão `aspect`, planos `near`/`far`.
fn camera_orthographic(height: f32, aspect: f32, near: f32, far: f32) -> mat4x4f {
    let nf = 1.0 / (near - far);
    return mat4x4f(
        vec4f(2.0 / (height * aspect), 0.0, 0.0, 0.0),
        vec4f(0.0, 2.0 / height, 0.0, 0.0),
        vec4f(0.0, 0.0, 2.0 * nf, 0.0),
        vec4f(0.0, 0.0, (far + near) * nf, 1.0),
    );
}

// Vista: inversa rígida da matriz de mundo da câmera, com a escala tirada das colunas (a câmera olha para −Z local).
fn camera_view(world: mat4x4f) -> mat4x4f {
    let rigid = mat4x4f(
        vec4f(normalize(world[0].xyz), 0.0),
        vec4f(normalize(world[1].xyz), 0.0),
        vec4f(normalize(world[2].xyz), 0.0),
        world[3],
    );
    return rigid_mat4_inverse(rigid);
}
