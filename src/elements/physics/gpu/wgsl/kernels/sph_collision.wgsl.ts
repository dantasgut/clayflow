/**
 * Kernel WGSL: sph_collision — colisão partícula-collider e AABB bounds.
 *
 * Idêntico em estrutura ao pbf_collision; usa SPHSimParams e SPHParticle.
 *
 * Bind groups:
 *   @group(0) @binding(0) — SPHSimParams (uniform)
 *   @group(1) @binding(0) — particles: array<SPHParticle> (read_write)
 *   @group(2) @binding(0) — colliders: array<ColliderDesc>
 *
 * Dispatch: ceil(particle_count / 64)
 */
export const WGSL_KERNEL_SPH_COLLISION = /* wgsl */`

@group(0) @binding(0) var<uniform>             sph_params: SPHSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<SPHParticle>;
@group(2) @binding(0) var<storage, read>       colliders:  array<ColliderDesc>;

@compute @workgroup_size(64)
fn sph_collision_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= sph_params.counts.x) { return; }

    let restitution    = sph_params.bounds.w;
    let bound_min      = sph_params.bounds.xyz;
    let collider_count = sph_params.counts.y;

    var pos = particles[i].pos.xyz;
    var vel = particles[i].vel.xyz;

    // ── Bounds AABB (piso + laterais) ────────────────────────────────────────
    if (pos.y < bound_min.y) { pos.y = bound_min.y; vel.y = max(0.0, vel.y * -restitution); }
    if (pos.x < bound_min.x) { pos.x = bound_min.x; vel.x = abs(vel.x) * restitution; }
    if (pos.z < bound_min.z) { pos.z = bound_min.z; vel.z = abs(vel.z) * restitution; }

    // ── Colliders SDF ─────────────────────────────────────────────────────────
    for (var c: u32 = 0u; c < collider_count; c++) {
        let col      = colliders[c];
        let world    = col.world_mat;
        let inv_w    = col.inv_world_mat;
        let pos_l    = (inv_w * vec4f(pos, 1.0)).xyz;

        var dist = 1e10f;
        var n_local = vec3f(0.0, 1.0, 0.0);

        if (col.shape_type == 0u) {
            let r = col.half.x;
            dist  = length(pos_l) - r;
            n_local = normalize(pos_l);
        } else if (col.shape_type == 1u) {
            let he = col.half.xyz;
            let q  = abs(pos_l) - he;
            dist   = length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
            let ax = abs(pos_l);
            if (ax.x > ax.y && ax.x > ax.z)  { n_local = vec3f(sign(pos_l.x), 0.0, 0.0); }
            else if (ax.y > ax.z)             { n_local = vec3f(0.0, sign(pos_l.y), 0.0); }
            else                              { n_local = vec3f(0.0, 0.0, sign(pos_l.z)); }
        } else if (col.shape_type == 2u) {
            dist    = pos_l.y - col.half.x;
            n_local = vec3f(0.0, 1.0, 0.0);
        }

        if (dist < 0.0) {
            let n_world = normalize((world * vec4f(n_local, 0.0)).xyz);
            pos -= dist * n_world;
            let vn = dot(vel, n_world);
            if (vn < 0.0) { vel -= (1.0 + restitution) * vn * n_world; }
        }
    }

    particles[i].pos = vec4f(pos, particles[i].pos.w);
    particles[i].vel = vec4f(vel, particles[i].vel.w);
}
`;
