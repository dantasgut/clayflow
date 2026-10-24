// Câmera (spec 007, research R10): projeções perspectiva e ortográfica e a vista a partir da matriz de mundo da
// câmera. Clip z em [0, 1], a convenção do WebGPU: o plano `near` vai a 0 e o `far` a 1.
// Requer `mat`.

// Perspectiva: campo de visão vertical `fov` (rad), razão `aspect`, planos `near`/`far`.
fn camera_perspective(fov: f32, aspect: f32, near: f32, far: f32) -> mat4x4f {
    let f = 1.0 / tan(fov * 0.5);
    let nf = 1.0 / (near - far);
    return mat4x4f(
        vec4f(f / aspect, 0.0, 0.0, 0.0),
        vec4f(0.0, f, 0.0, 0.0),
        vec4f(0.0, 0.0, far * nf, -1.0),
        vec4f(0.0, 0.0, far * near * nf, 0.0),
    );
}

// Ortográfica: altura visível `height`, razão `aspect`, planos `near`/`far`.
fn camera_orthographic(height: f32, aspect: f32, near: f32, far: f32) -> mat4x4f {
    let nf = 1.0 / (near - far);
    return mat4x4f(
        vec4f(2.0 / (height * aspect), 0.0, 0.0, 0.0),
        vec4f(0.0, 2.0 / height, 0.0, 0.0),
        vec4f(0.0, 0.0, nf, 0.0),
        vec4f(0.0, 0.0, near * nf, 1.0),
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
    return rigid_inverse(rigid);
}

// Vista de um olho `eye` mirando `center` com o "para cima" `up` (sem eixo lateral definido — `up` paralelo à
// direção —, o eixo fica nulo, como na conta da CPU que este estágio substitui).
fn camera_look_at(eye: vec3f, center: vec3f, up: vec3f) -> mat4x4f {
    let zv = eye - center;
    let zl = length(zv);
    let z = select(zv / zl, zv, zl == 0.0);
    let xv = cross(up, z);
    let xl = length(xv);
    let x = select(xv / xl, xv, xl == 0.0);
    let y = cross(z, x);
    return mat4x4f(
        vec4f(x.x, y.x, z.x, 0.0),
        vec4f(x.y, y.y, z.y, 0.0),
        vec4f(x.z, y.z, z.z, 0.0),
        vec4f(-dot(x, eye), -dot(y, eye), -dot(z, eye), 1.0),
    );
}

// A projeção de uma câmera: ortográfica (`kind` 1, altura visível `ortho_height`) ou perspectiva (campo de visão
// vertical `fov`).
fn camera_projection(kind: u32, fov: f32, ortho_height: f32, aspect: f32, near: f32, far: f32) -> mat4x4f {
    if (kind == 1u) { return camera_orthographic(ortho_height, aspect, near, far); }
    return camera_perspective(fov, aspect, near, far);
}

// Desloca a projeção `m` em NDC por `offset` depois da projeção (translação em clip proporcional a w: x' = x + o·w),
// coluna a coluna — o deslocamento da amostra dentro do pixel (spec 034) e a sua retirada (`offset` negativo).
fn camera_shift(m: mat4x4f, offset: vec2f) -> mat4x4f {
    var out = m;
    for (var c = 0; c < 4; c++) {
        out[c] = vec4f(m[c].xy + offset * m[c].w, m[c].zw);
    }
    return out;
}

// Ortográfica de caixa `[l, r] × [b, t]`, planos `n`/`f`, clip z em [0, 1] (a do mapa de sombra).
fn camera_orthographic_box(l: f32, r: f32, b: f32, t: f32, n: f32, f: f32) -> mat4x4f {
    return mat4x4f(
        vec4f(2.0 / (r - l), 0.0, 0.0, 0.0),
        vec4f(0.0, 2.0 / (t - b), 0.0, 0.0),
        vec4f(0.0, 0.0, 1.0 / (n - f), 0.0),
        vec4f((r + l) / (l - r), (t + b) / (b - t), n / (n - f), 1.0),
    );
}
