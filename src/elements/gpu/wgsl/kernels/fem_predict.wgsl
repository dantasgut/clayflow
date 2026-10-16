// portado de legacy/elements/physics/gpu/wgsl/kernels/fem_predict.wgsl.ts
// Campos de força (spec 009): `field_accel` lê os registros do ponto `field` (recursos declarados do módulo).

@compute @workgroup_size(WORKGROUP_SIZE)
fn fem_predict_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
    let i = gid.x;
    if (i >= fem_params.node_count || !pool_live(live[i >> 5u], i)) { return; }

    let inv_mass = nodes[i].pos.w;
    if (inv_mass == 0.0) {
        // Nó fixo — pred permanece na posição atual
        nodes[i].pred = vec4f(nodes[i].pos.xyz, nodes[i].pred.w);
        return;
    }

    let dt  = fem_params.dt_sub;
    var vel = nodes[i].vel.xyz + fem_params.gravity * dt;
    let pos = nodes[i].pos.xyz;
    // Campos (spec 009): termo à parte, só quando não são zero — sem campos, a mesma trajetória bit a bit.
    let body = FieldBody(inv_mass, fem_params.field_density, 0.0, 0.0);
    let field = field_accel(pos, nodes[i].vel.xyz, fem_params.field_time, body);
    if (any(field != vec3f(0.0))) { vel += field * dt; }

    nodes[i].vel  = vec4f(vel, nodes[i].vel.w);
    nodes[i].pred = vec4f(pos + vel * dt, nodes[i].pred.w);
}
