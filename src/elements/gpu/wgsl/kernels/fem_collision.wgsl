// portado de legacy/elements/physics/gpu/wgsl/kernels/fem_collision.wgsl.ts
@group(0) @binding(0) var<uniform>             fem_params: FEMSimParams;
@group(0) @binding(1) var<storage, read_write> nodes:      array<Particle>;
@group(0) @binding(2) var<storage, read>       colliders:  array<ColliderDesc>;
@group(0) @binding(3) var<storage, read>       rb_bodies:  array<RigidBody>;

@compute @workgroup_size(64)
fn fem_collision_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= fem_params.node_count) { return; }

    let inv_mass = nodes[i].pos.w;
    if (inv_mass == 0.0) { return; }  // nó fixo — ignora

    let radius = fem_params.collision_radius;

    for (var ci = 0u; ci < fem_params.collider_count; ci++) {
        let col = colliders[ci];

        let world_pred = nodes[i].pred.xyz;
        let local_pred = (col.inv_world_mat * vec4f(world_pred, 1.0)).xyz;

        let d = eval_sdf(local_pred, col.shape_type, col.half);

        // Limites finitos do plano
        if (col.shape_type == 2u) {
            let bw = col.bounds.x;
            let bd = col.bounds.y;
            if (bw > 0.0 && (abs(local_pred.x) > bw || abs(local_pred.z) > bd)) { continue; }
        }

        if (d >= radius) { continue; }

        let depth = radius - d;  // profundidade de penetração positiva

        // Normal em world space via gradiente numérico
        let grad_local = sdf_gradient(local_pred, d, col.shape_type, col.half);
        let wn_raw = mat4_upper3x3_transform(col.world_mat, grad_local);
        let wn_len = length(wn_raw);
        if (wn_len < 1e-8) { continue; }
        let wn = wn_raw / wn_len;

        // Passo 1: corrige pred E pos para preservar a velocidade XPBD (vel = (pred-pos)/dt)
        nodes[i].pred = vec4f(nodes[i].pred.xyz + depth * wn, nodes[i].pred.w);
        nodes[i].pos  = vec4f(nodes[i].pos.xyz  + depth * wn, nodes[i].pos.w);

        // Passo 2: restituição — impulso em pred na direção normal
        let vel_pred    = (nodes[i].pred.xyz - nodes[i].pos.xyz) / max(fem_params.dt_sub, 1e-12);
        let v_along_n   = dot(vel_pred, wn);
        if (v_along_n < 0.0) {
            let restitution = fem_params.restitution;
            nodes[i].pred = vec4f(
                nodes[i].pred.xyz - (1.0 + restitution) * v_along_n * fem_params.dt_sub * wn,
                nodes[i].pred.w,
            );
        }
    }

    // ── Colisão nó × corpos rígidos dinâmicos ────────────────────────────────
    for (var ri = 0u; ri < fem_params.rb_count; ri++) {
        let rb = rb_bodies[ri];

        // Pula cinemáticos (inv_mass = 0) — são colisores estáticos, já cobertos acima
        if (rb.pos.w == 0.0) { continue; }

        let rb_pos  = rb.pos_pred.xyz;
        let rb_rot  = rb.rot_pred;
        let shape   = u32(rb.body_shape.x);
        // eval_sdf e sdf_gradient esperam vec4f; body_shape.yzw são as half-extents (vec3f)
        let half    = vec4f(rb.body_shape.yzw, 0.0);

        // Transforma pred do nó para o espaço local do corpo rígido
        let local_pt = quat_rotate_vec_inv(rb_rot, nodes[i].pred.xyz - rb_pos);

        let d = eval_sdf(local_pt, shape, half);
        if (d >= radius) { continue; }

        let depth = radius - d;

        // Normal em world space via gradiente local rotacionado
        let grad_local = sdf_gradient(local_pt, d, shape, half);
        let wn_rb_raw  = quat_rotate_vec(rb_rot, grad_local);
        let wn_rb_len  = length(wn_rb_raw);
        if (wn_rb_len < 1e-8) { continue; }
        let wn_rb = wn_rb_raw / wn_rb_len;

        // Corrige pred e pos
        nodes[i].pred = vec4f(nodes[i].pred.xyz + depth * wn_rb, nodes[i].pred.w);
        nodes[i].pos  = vec4f(nodes[i].pos.xyz  + depth * wn_rb, nodes[i].pos.w);

        // Restituição
        let vel_rb    = (nodes[i].pred.xyz - nodes[i].pos.xyz) / max(fem_params.dt_sub, 1e-12);
        let v_rb_n    = dot(vel_rb, wn_rb);
        if (v_rb_n < 0.0) {
            nodes[i].pred = vec4f(
                nodes[i].pred.xyz - (1.0 + fem_params.restitution) * v_rb_n * fem_params.dt_sub * wn_rb,
                nodes[i].pred.w,
            );
        }
    }
}
