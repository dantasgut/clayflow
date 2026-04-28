// portado de legacy/elements/physics/gpu/wgsl/math/mpm_weights.wgsl.ts
// ── B-Spline quadrática 1D ────────────────────────────────────────────────────

// Retorna os 3 pesos quadráticos para um deslocamento fracionário fx ∈ [0.5, 1.5).
// fx = posição fracionária da partícula em relação ao nó base (adimensional).
fn bspline_weights_1d(fx: f32) -> vec3f {
    let w0 = 0.5 * (1.5 - fx) * (1.5 - fx);
    let w1 = 0.75 - (fx - 1.0) * (fx - 1.0);
    let w2 = 0.5 * (fx - 0.5) * (fx - 0.5);
    return vec3f(w0, w1, w2);
}

// Retorna os 3 gradientes quadráticos (×inv_dx, pré-dividido por dx).
fn bspline_gradients_1d(fx: f32, inv_dx: f32) -> vec3f {
    let dw0 = -(1.5 - fx) * inv_dx;
    let dw1 = -2.0 * (fx - 1.0) * inv_dx;
    let dw2 =  (fx - 0.5) * inv_dx;
    return vec3f(dw0, dw1, dw2);
}

// ── Pesos e gradientes 3D compostos ──────────────────────────────────────────

// Calcula pesos e gradientes 3D para os 27 nós vizinhos de uma partícula.
// Retorna arrays [d][k] onde d ∈ {0,1,2} = eixo, k ∈ {0,1,2} = nó no eixo.
//
// @param fx     — vetor fracionário (o - base), componentes ∈ [0.5, 1.5)
// @param inv_dx — 1 / cell_size (pré-calculado em MPMSimParams)
// @param w      — saída: w[d] = pesos 1D para eixo d (vec3f com 3 pesos)
// @param dw     — saída: dw[d] = gradientes 1D para eixo d
fn mpm_compute_weights(
    fx:     vec3f,
    inv_dx: f32,
    w:      ptr<function, array<vec3f, 3>>,
    dw:     ptr<function, array<vec3f, 3>>,
) {
    (*w)[0]  = bspline_weights_1d(fx.x);
    (*w)[1]  = bspline_weights_1d(fx.y);
    (*w)[2]  = bspline_weights_1d(fx.z);
    (*dw)[0] = bspline_gradients_1d(fx.x, inv_dx);
    (*dw)[1] = bspline_gradients_1d(fx.y, inv_dx);
    (*dw)[2] = bspline_gradients_1d(fx.z, inv_dx);
}

// ── Produto escalar 3D e gradiente vetorial 3D para um nó (a, b, c) ──────────

// Peso escalar w_ip para o nó deslocado (a, b, c) ∈ {0,1,2}³.
fn mpm_weight_3d(w: ptr<function, array<vec3f, 3>>, a: u32, b: u32, c: u32) -> f32 {
    return (*w)[0][a] * (*w)[1][b] * (*w)[2][c];
}

// Gradiente vetorial ∇w_ip (vec3f) para o nó deslocado (a, b, c).
fn mpm_grad_3d(
    w:  ptr<function, array<vec3f, 3>>,
    dw: ptr<function, array<vec3f, 3>>,
    a: u32, b: u32, c: u32,
) -> vec3f {
    return vec3f(
        (*dw)[0][a] * (*w)[1][b]  * (*w)[2][c],
        (*w)[0][a]  * (*dw)[1][b] * (*w)[2][c],
        (*w)[0][a]  * (*w)[1][b]  * (*dw)[2][c],
    );
}

// ── Índice linear de nó na grade ─────────────────────────────────────────────

// Calcula o índice linear do nó (bx+a, by+b, bz+c) na grade cúbica grid_x × grid_y × grid_z.
// Retorna 0xFFFFFFFF se o nó estiver fora da grade.
fn mpm_node_index(
    base:   vec3i,
    a: u32, b: u32, c: u32,
    grid_x: u32, grid_y: u32, grid_z: u32,
) -> u32 {
    let ix = base.x + i32(a);
    let iy = base.y + i32(b);
    let iz = base.z + i32(c);
    if (ix < 0 || iy < 0 || iz < 0
        || u32(ix) >= grid_x || u32(iy) >= grid_y || u32(iz) >= grid_z) {
        return 0xFFFFFFFFu;
    }
    return u32(ix) + u32(iy) * grid_x + u32(iz) * grid_x * grid_y;
}
