/**
 * Kernel WGSL: mpm_p2g — transferência Partícula → Grade (Particle-to-Grid).
 *
 * Implementa a fase P2G do MLS-MPM (Hu et al. 2018) com campo afim APIC.
 * Cada thread processa uma partícula e acumula nas 27 células da grade vizinhas.
 *
 * Para cada partícula p:
 *   1. Calcula pesos B-spline quadráticos w_ip e gradientes ∇w_ip
 *   2. Calcula o stress elástico P (Neo-Hookean) e o produto P×F^T
 *   3. Para cada nó vizinho i (27 = 3³):
 *      - Δm_i    = w_ip × mass_p
 *      - afine   = C_p × (x_i - x_p)                      [APIC momentum]
 *      - force   = -(dt × V0_p) × (P×F^T) × ∇w_ip         [stress force]
 *      - Δmom_i  = w_ip × mass_p × (vel_p + afine) + force
 *      - atomicAdd(grid.mass_i32,  round(Δm_i × fixed_scale))
 *      - atomicAdd(grid.mom_{x,y,z}_i32, round(Δmom_i × fixed_scale))
 *
 * ## Modelo de material: Neo-Hookean
 *
 *   J      = det(F)
 *   F_invT = transpose(inverse(F))
 *   P      = mu * (F - F_invT) + lambda * log(J) * F_invT
 *   PFT    = P × F^T           (contribuição de força)
 *
 * Bind groups:
 *   @group(0) @binding(0) — MPMSimParams  (uniform)
 *   @group(1) @binding(0) — MPMGridNode[] (storage read_write — atomicAdd)
 *   @group(2) @binding(0) — MPMParticle[] (storage read)
 *
 * Dispatch: ceil(particle_count / 64) workgroups.
 *
 * Depende de: MPMSimParams, MPMGridNode, MPMParticle,
 *             mpm_weights (mpm_compute_weights, mpm_weight_3d, mpm_grad_3d, mpm_node_index),
 *             linalg (mat3_det, mat3_inverse, mat3_transpose, mat3_mul, mat3_from_cols).
 */
export const WGSL_KERNEL_MPM_P2G = /* wgsl */`

@group(0) @binding(0) var<uniform>             mpm_params: MPMSimParams;
@group(1) @binding(0) var<storage, read_write> grid:       array<MPMGridNode>;
@group(2) @binding(0) var<storage, read>       particles:  array<MPMParticle>;

@compute @workgroup_size(64)
fn mpm_p2g_main(@builtin(global_invocation_id) gid: vec3u) {
    let p = gid.x;
    if (p >= mpm_params.particle_count) { return; }

    let particle = particles[p];
    let pos      = particle.pos.xyz;
    let vel      = particle.vel.xyz;
    let mass_p   = particle.pos.w;
    let vol0_p   = particle.vel.w;
    let dt       = mpm_params.dt_sub;
    let inv_dx   = mpm_params.inv_dx;
    let fs       = mpm_params.fixed_scale;

    // ── Gradiente de deformação F ─────────────────────────────────────────────
    let F = mat3_from_cols(particle.F_col0.xyz, particle.F_col1.xyz, particle.F_col2.xyz);

    // ── Matriz afim C (APIC momentum matrix) ─────────────────────────────────
    let C = mat3_from_cols(particle.C_col0.xyz, particle.C_col1.xyz, particle.C_col2.xyz);

    // ── Modelo Neo-Hookean: calcula P × F^T ──────────────────────────────────
    let J         = mat3_det(F);
    let mu        = mpm_params.mu;
    let lam       = mpm_params.lambda_lame;
    let F_inv     = mat3_inverse(F);
    let F_inv_T   = mat3_transpose(F_inv);
    let log_J     = log(max(J, 1e-6));
    // P = mu*(F - F_invT) + lambda*log(J)*F_invT
    let P_col0 = mu * (F[0] - F_inv_T[0]) + lam * log_J * F_inv_T[0];
    let P_col1 = mu * (F[1] - F_inv_T[1]) + lam * log_J * F_inv_T[1];
    let P_col2 = mu * (F[2] - F_inv_T[2]) + lam * log_J * F_inv_T[2];
    let P  = mat3_from_cols(P_col0, P_col1, P_col2);
    let FT = mat3_transpose(F);
    let PFT = mat3_mul(P, FT);  // P × F^T, contribuição de força

    // ── Pesos B-spline ────────────────────────────────────────────────────────
    let o    = pos * inv_dx;
    let base = vec3i(i32(floor(o.x - 0.5)), i32(floor(o.y - 0.5)), i32(floor(o.z - 0.5)));
    let fx   = o - vec3f(vec3i(base));

    var w:  array<vec3f, 3>;
    var dw: array<vec3f, 3>;
    mpm_compute_weights(fx, inv_dx, &w, &dw);

    let gx = mpm_params.grid_x;
    let gy = mpm_params.grid_y;
    let gz = mpm_params.grid_z;

    // ── Loop sobre os 27 nós vizinhos ─────────────────────────────────────────
    for (var a: u32 = 0u; a < 3u; a++) {
    for (var b: u32 = 0u; b < 3u; b++) {
    for (var c: u32 = 0u; c < 3u; c++) {
        let node_idx = mpm_node_index(base, a, b, c, gx, gy, gz);
        if (node_idx == 0xFFFFFFFFu) { continue; }

        let w_ip   = mpm_weight_3d(&w, a, b, c);
        let grad_w = mpm_grad_3d(&w, &dw, a, b, c);

        // Posição do nó em world space
        let ix = f32(base.x + i32(a));
        let iy = f32(base.y + i32(b));
        let iz = f32(base.z + i32(c));
        let node_world = vec3f(ix, iy, iz) * mpm_params.cell_size + mpm_params.grid_origin;
        let dpos       = node_world - pos;

        // Contribuição de massa
        let dm = w_ip * mass_p;

        // Contribuição de momentum (APIC affine + stress force)
        let affine_vel = vel + C * dpos;  // v_p + C_p × (x_i - x_p)
        let dmom = w_ip * mass_p * affine_vel
                 + (-dt * vol0_p) * (PFT * grad_w);

        // Acumula atomicamente em ponto fixo
        atomicAdd(&grid[node_idx].mass_i32,  i32(dm * fs));
        atomicAdd(&grid[node_idx].mom_x_i32, i32(dmom.x * fs));
        atomicAdd(&grid[node_idx].mom_y_i32, i32(dmom.y * fs));
        atomicAdd(&grid[node_idx].mom_z_i32, i32(dmom.z * fs));
    }}}
}
`;
