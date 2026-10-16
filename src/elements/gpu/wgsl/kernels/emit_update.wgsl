// Um passo das partículas de um emissor (spec 009): idade; a que passa da vida morre; as vivas integram gravidade e
// campos (Euler semi-implícito); escreve o vértice de cada slot na nuvem de pontos do emissor — a morta vai para longe
// da câmera (cortada pelo plano distante).
// Requer: structs EmitterParams, ComputeParticle; field_point_types; field_accel (ponto); recursos `emit_params`,
// `emit_particles`, `emit_vertices` (os registros dos campos vêm do `field_builtin` e dos módulos das funções).

const EMIT_FAR: f32 = 1.0e9;

@compute @workgroup_size(WORKGROUP_SIZE)
fn emit_update_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= emit_params.capacity) { return; }
    var q = emit_particles[i];
    var alive = q.ageAndLife.y > 0.0;
    if (alive) {
        let age = q.ageAndLife.x + emit_params.dt;
        if (age >= q.ageAndLife.y) {
            q.ageAndLife = vec4f(0.0, 0.0, 0.0, 0.0);
            alive = false;
        } else {
            let x = q.position.xyz;
            var v = q.velocity.xyz + emit_params.gravity * emit_params.dt;
            let field = field_accel(x, q.velocity.xyz, emit_params.time, FieldBody(1.0, 0.0, 0.0, 0.0));
            if (any(field != vec3f(0.0))) { v += field * emit_params.dt; }
            q.velocity = vec4f(v, 0.0);
            q.position = vec4f(x + v * emit_params.dt, 1.0);
            q.ageAndLife.x = age;
        }
        emit_particles[i] = q;
    }
    let o = i;
    let p = select(vec3f(0.0, EMIT_FAR, 0.0), q.position.xyz, alive);
    emit_vertices[o].px = p.x;
    emit_vertices[o].py = p.y;
    emit_vertices[o].pz = p.z;
    emit_vertices[o].nx = 0.0;
    emit_vertices[o].ny = 1.0;
    emit_vertices[o].nz = 0.0;
    emit_vertices[o].u = q.params.x;
    emit_vertices[o].v = q.params.y;
}
