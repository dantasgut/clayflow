/**
 * Kernel WGSL: mpm_grid_update — integra forças e normaliza velocidades na grade.
 *
 * Executa após P2G. Para cada nó ativo (massa > ε):
 *   1. Converte atomics i32 para f32: m_i = mass_i32 / fixed_scale
 *   2. Normaliza momentum: v_i = mom_i / m_i
 *   3. Aplica gravidade: v_i.y += dt × gravity.y
 *   4. Condições de contorno (paredes da grade): clamp de velocidade
 *   5. Colisão com colliders SDF (opcional): deflexão de velocidade
 *   6. Escreve v_i no campo vel do nó
 *
 * ## Condições de contorno
 *
 * A grade tem `boundary_width = 3` células de margem (cobre o suporte
 * da B-spline quadrática). Nós na borda não podem ter velocidade se
 * apontando para fora da grade (slip-wall BC).
 *
 * Bind groups:
 *   @group(0) @binding(0) — MPMSimParams    (uniform)
 *   @group(1) @binding(0) — MPMGridNode[]   (storage read_write)
 *   @group(3) @binding(0) — ColliderDesc[]  (storage read)
 *
 * Dispatch: ceil(grid_x × grid_y × grid_z / 64) workgroups.
 *
 * Depende de: MPMSimParams, MPMGridNode, ColliderDesc,
 *             sdf.wgsl (eval_sdf), mat.wgsl (mat4_upper3x3_transform).
 */
export const WGSL_KERNEL_MPM_GRID_UPDATE = /* wgsl */`

@group(0) @binding(0) var<uniform>             mpm_params: MPMSimParams;
@group(1) @binding(0) var<storage, read_write> grid:       array<MPMGridNode>;
@group(3) @binding(0) var<storage, read>       colliders:  array<ColliderDesc>;

const MPM_BOUNDARY: u32 = 3u;

@compute @workgroup_size(64)
fn mpm_grid_update_main(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    let total = mpm_params.grid_x * mpm_params.grid_y * mpm_params.grid_z;
    if (idx >= total) { return; }

    let mass_raw = atomicLoad(&grid[idx].mass_i32);
    if (mass_raw == 0) { return; }  // nó vazio — sem partículas contribuíram

    let fs    = mpm_params.fixed_scale;
    let m_i   = f32(mass_raw) / fs;
    if (m_i < 1e-8) { return; }

    let mom_x = f32(atomicLoad(&grid[idx].mom_x_i32)) / fs;
    let mom_y = f32(atomicLoad(&grid[idx].mom_y_i32)) / fs;
    let mom_z = f32(atomicLoad(&grid[idx].mom_z_i32)) / fs;

    // Normaliza momentum → velocidade
    var v_i = vec3f(mom_x, mom_y, mom_z) / m_i;

    // Aplica gravidade
    v_i += mpm_params.gravity * mpm_params.dt_sub;

    // ── Coordenadas do nó na grade ────────────────────────────────────────────
    let gx = mpm_params.grid_x;
    let gy = mpm_params.grid_y;
    let ix = u32(idx % gx);
    let iz = u32(idx / (gx * gy));
    let iy = u32((idx / gx) % gy);

    // ── Condições de contorno (slip-wall) ─────────────────────────────────────
    if (ix < MPM_BOUNDARY && v_i.x < 0.0) { v_i.x = 0.0; }
    if (iy < MPM_BOUNDARY && v_i.y < 0.0) { v_i.y = 0.0; }
    if (iz < MPM_BOUNDARY && v_i.z < 0.0) { v_i.z = 0.0; }
    if (ix > gx - MPM_BOUNDARY - 1u && v_i.x > 0.0) { v_i.x = 0.0; }
    if (iy > gy - MPM_BOUNDARY - 1u && v_i.y > 0.0) { v_i.y = 0.0; }
    if (iz > mpm_params.grid_z - MPM_BOUNDARY - 1u && v_i.z > 0.0) { v_i.z = 0.0; }

    // ── Colisão com colliders SDF ─────────────────────────────────────────────
    // Posição do nó em world space
    let node_world = vec3f(f32(ix), f32(iy), f32(iz)) * mpm_params.cell_size + mpm_params.grid_origin;

    for (var ci = 0u; ci < mpm_params.collider_count; ci++) {
        let col       = colliders[ci];
        let local_pos = (col.inv_world_mat * vec4f(node_world, 1.0)).xyz;
        let d         = eval_sdf(local_pos, col.shape_type, col.half);

        if (d >= 0.0) { continue; }  // nó fora do collider

        // Normal em world space
        let sdf_grad = sdf_gradient(local_pos, d, col.shape_type, col.half);
        let n_raw    = mat4_upper3x3_transform(col.world_mat, sdf_grad);
        let n_len    = length(n_raw);
        if (n_len < 1e-8) { continue; }
        let n = n_raw / n_len;

        // Remove componente de velocidade entrando no collider
        let v_n = dot(v_i, n);
        if (v_n < 0.0) {
            v_i -= v_n * n;
        }
    }

    // Escreve velocidade normalizada para G2P
    grid[idx].vel = v_i;
}
`;
