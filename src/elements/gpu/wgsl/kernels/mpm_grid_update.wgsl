// portado de legacy/elements/physics/gpu/wgsl/kernels/mpm_grid_update.wgsl.ts
@group(0) @binding(0) var<uniform>             mpm_params: MPMSimParams;
@group(1) @binding(0) var<storage, read_write> grid:       array<MPMGridNode>;
// Campos de força (spec 009): registros e slots vivos do pool `FieldFnRecord`, ligados pela C2 (ponto `field`).
@group(1) @binding(1) var<storage, read>       field_records: array<FieldFnRecord>;
@group(1) @binding(2) var<storage, read>       field_live:    array<u32>;
// Grupo 2: conjunto de colliders (`collider_set.wgsl`).

const MPM_BOUNDARY: u32 = 3u;

@compute @workgroup_size(64)
fn mpm_grid_update_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Tempo da iteração: escolhe a cópia do passo nos colliders de superfície (spec 010).
    collider_time = mpm_params.field_time;
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
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

    // Campos (spec 009) na posição do nó: termo à parte, só quando não são zero — sem campos, bit a bit.
    let field_node = vec3f(
        f32(idx % mpm_params.grid_x),
        f32((idx / mpm_params.grid_x) % mpm_params.grid_y),
        f32(idx / (mpm_params.grid_x * mpm_params.grid_y)),
    ) * mpm_params.cell_size + mpm_params.grid_origin;
    let field_body = FieldBody(1.0 / m_i, mpm_params.field_density, 0.0, 0.0);
    let field = field_accel(field_node, v_i, mpm_params.field_time, field_body);
    if (any(field != vec3f(0.0))) { v_i += field * mpm_params.dt_sub; }

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

    // ── Colliders (pools tipados; pose pelo corpo dono) ──────────────────────
    let node_world = vec3f(f32(ix), f32(iy), f32(iz)) * mpm_params.cell_size + mpm_params.grid_origin;
    // Faixa de uma célula: a grade não segura paredes finas (dentro de uma parede de ~2 células a face mais próxima
    // já é a de fora e a normal inverte); bloquear a velocidade entrante a até dx da superfície mantém o fluido fora.
    collider_set_constrain(node_world, &v_i, mpm_params.cell_size);

    // Escreve velocidade normalizada para G2P
    grid[idx].vel = v_i;
}
