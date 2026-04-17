/**
 * Kernel WGSL: mpm_g2p — transferência Grade → Partícula (Grid-to-Particle).
 *
 * Executa após grid_update. Para cada partícula p:
 *   1. Calcula pesos B-spline quadráticos w_ip
 *   2. Interpola velocidade: v_p = Σ_i w_ip × v_i
 *   3. Acumula campo afim APIC: B_p = Σ_i w_ip × v_i ⊗ (x_i - x_p)
 *   4. Aplica fator MLS-MPM: C_p = (4/dx²) × B_p = D_inv × B_p
 *   5. Avança posição: x_p += dt × v_p
 *   6. Atualiza gradiente de deformação: F_p = (I + dt × C_p) × F_p
 *
 * ## Identidade central do MLS-MPM
 *
 * Na formulação MLS-MPM, C_p é ao mesmo tempo:
 *   - O campo afim de transferência de momentum (APIC)
 *   - O gradiente de velocidade ∇v_p da partícula
 *
 * Portanto F_p atualiza como: F_new = (I + dt × C_p) × F_old
 * (integração de Euler de Ḟ = ∇v × F = C_p × F).
 *
 * Bind groups:
 *   @group(0) @binding(0) — MPMSimParams   (uniform)
 *   @group(1) @binding(0) — MPMGridNode[]  (storage read_write — atomic requerido)
 *   @group(2) @binding(0) — MPMParticle[]  (storage read_write)
 *
 * Dispatch: ceil(particle_count / 64) workgroups.
 *
 * Depende de: MPMSimParams, MPMGridNode, MPMParticle,
 *             mpm_weights, linalg (mat3_det, mat3_from_cols).
 */
export const WGSL_KERNEL_MPM_G2P = /* wgsl */`

@group(0) @binding(0) var<uniform>             mpm_params: MPMSimParams;
@group(1) @binding(0) var<storage, read_write> grid:       array<MPMGridNode>;
@group(2) @binding(0) var<storage, read_write> particles:  array<MPMParticle>;

@compute @workgroup_size(64)
fn mpm_g2p_main(@builtin(global_invocation_id) gid: vec3u) {
    let p = gid.x;
    if (p >= mpm_params.particle_count) { return; }

    let pos    = particles[p].pos.xyz;
    let inv_dx = mpm_params.inv_dx;
    let dt     = mpm_params.dt_sub;

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

    // ── Acumuladores ─────────────────────────────────────────────────────────
    var v_new = vec3f(0.0);
    // B_p = Σ w_ip × v_i ⊗ (x_i - x_p)  [soma de rank-1, 3×3]
    var B_col0 = vec3f(0.0);
    var B_col1 = vec3f(0.0);
    var B_col2 = vec3f(0.0);

    // ── Loop sobre os 27 nós vizinhos ─────────────────────────────────────────
    for (var a: u32 = 0u; a < 3u; a++) {
    for (var b: u32 = 0u; b < 3u; b++) {
    for (var c: u32 = 0u; c < 3u; c++) {
        let node_idx = mpm_node_index(base, a, b, c, gx, gy, gz);
        if (node_idx == 0xFFFFFFFFu) { continue; }

        let w_ip = mpm_weight_3d(&w, a, b, c);

        // Velocidade do nó (escrita por grid_update)
        let v_i = grid[node_idx].vel;

        // Posição do nó em world space
        let ix = f32(base.x + i32(a));
        let iy = f32(base.y + i32(b));
        let iz = f32(base.z + i32(c));
        let node_world = vec3f(ix, iy, iz) * mpm_params.cell_size + mpm_params.grid_origin;
        let dpos = node_world - pos;

        // Interpola velocidade
        v_new += w_ip * v_i;

        // Acumula tensor de momentum afim B_p (outer product v_i ⊗ dpos)
        B_col0 += w_ip * v_i.x * dpos;   // coluna 0: v_i × dpos.x
        B_col1 += w_ip * v_i.y * dpos;   // coluna 1: v_i × dpos.y
        B_col2 += w_ip * v_i.z * dpos;   // coluna 2: v_i × dpos.z
    }}}

    // ── Campo afim C_p = D^{-1} × B_p ────────────────────────────────────────
    // Para B-spline quadrática: D = (1/4)×dx²×I → D_inv = 4/dx² = 4×inv_dx²
    let D_inv   = 4.0 * inv_dx * inv_dx;
    let C_col0  = D_inv * B_col0;
    let C_col1  = D_inv * B_col1;
    let C_col2  = D_inv * B_col2;

    // ── Avança posição ────────────────────────────────────────────────────────
    var new_pos = pos + dt * v_new;

    // Clamp para dentro da grade (segurança)
    let grid_min = mpm_params.grid_origin + vec3f(f32(MPM_BOUNDARY_G2P)) * mpm_params.cell_size;
    let grid_max = mpm_params.grid_origin
                 + vec3f(f32(mpm_params.grid_x) - f32(MPM_BOUNDARY_G2P),
                         f32(mpm_params.grid_y) - f32(MPM_BOUNDARY_G2P),
                         f32(mpm_params.grid_z) - f32(MPM_BOUNDARY_G2P))
                 * mpm_params.cell_size;
    new_pos = clamp(new_pos, grid_min, grid_max);

    // ── Atualiza gradiente de deformação F ────────────────────────────────────
    // F_new = (I + dt × C_p) × F_old
    let F_old = mat3_from_cols(
        particles[p].F_col0.xyz,
        particles[p].F_col1.xyz,
        particles[p].F_col2.xyz,
    );
    let C_mat = mat3_from_cols(C_col0, C_col1, C_col2);

    // I + dt × C_p
    let I_plus_dC = mat3_from_cols(
        vec3f(1.0 + dt * C_col0.x,       dt * C_col0.y,       dt * C_col0.z),
        vec3f(      dt * C_col1.x, 1.0 + dt * C_col1.y,       dt * C_col1.z),
        vec3f(      dt * C_col2.x,       dt * C_col2.y, 1.0 + dt * C_col2.z),
    );

    let F_new = mat3_mul(I_plus_dC, F_old);
    let J_new = mat3_det(F_new);

    // ── Escreve resultados ────────────────────────────────────────────────────
    particles[p].vel    = vec4f(v_new,    particles[p].vel.w);
    particles[p].pos    = vec4f(new_pos,  particles[p].pos.w);
    particles[p].F_col0 = vec4f(F_new[0], J_new);
    particles[p].F_col1 = vec4f(F_new[1], particles[p].F_col1.w);
    particles[p].F_col2 = vec4f(F_new[2], particles[p].F_col2.w);
    particles[p].C_col0 = vec4f(C_col0, 0.0);
    particles[p].C_col1 = vec4f(C_col1, 0.0);
    particles[p].C_col2 = vec4f(C_col2, 0.0);
}

const MPM_BOUNDARY_G2P: u32 = 3u;
`;
