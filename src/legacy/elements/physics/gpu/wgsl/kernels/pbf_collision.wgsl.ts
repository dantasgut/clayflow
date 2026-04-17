/**
 * Kernel WGSL: pbf_collision — colisão partícula-collider e AABB de bounds.
 *
 * Para cada partícula i:
 *   1. Clamp AABB: pos restrita a [bounds_min, bounds_min + extent], vel refletida
 *   2. Colisão com colliders SDF: se dist < 0, projeta para fora e reflete vel
 *
 * Bind groups:
 *   @group(0) @binding(0) — PBFSimParams (uniform)
 *   @group(1) @binding(0) — particles: array<PBFParticle> (read_write)
 *   @group(2) @binding(0) — colliders: array<ColliderDesc>
 *
 * Dispatch: ceil(particle_count / 64)
 */
export const WGSL_KERNEL_PBF_COLLISION = /* wgsl */`

@group(0) @binding(0) var<uniform>             pbf_params: PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<PBFParticle>;
@group(2) @binding(0) var<storage, read>       colliders:  array<ColliderDesc>;

@compute @workgroup_size(64)
fn pbf_collision_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= pbf_params.counts.x) { return; }

    let restitution    = pbf_params.bounds.w;
    let bound_min      = pbf_params.bounds.xyz;
    let collider_count = pbf_params.counts.y;

    var pos = particles[i].pos.xyz;
    var vel = particles[i].vel.xyz;

    // ── Bounds AABB ───────────────────────────────────────────────────────────
    // Usa bound_min como piso e assume domínio simétrico em y (apenas piso)
    if (pos.y < bound_min.y) {
        pos.y = bound_min.y;
        vel.y = max(0.0, vel.y * -restitution);
    }
    if (pos.x < bound_min.x) { pos.x = bound_min.x; vel.x = abs(vel.x) * restitution; }
    if (pos.z < bound_min.z) { pos.z = bound_min.z; vel.z = abs(vel.z) * restitution; }

    // ── Colliders SDF ─────────────────────────────────────────────────────────
    for (var c: u32 = 0u; c < collider_count; c++) {
        let col     = colliders[c];
        let world   = col.world_mat;
        let inv_w   = col.inv_world_mat;

        // Transforma posição para local do collider
        let pos_local = (inv_w * vec4f(pos, 1.0)).xyz;

        var dist = 1e10f;
        var normal_local = vec3f(0.0, 1.0, 0.0);

        if (col.shape_type == 0u) {
            // Esfera: radius = col.half.x
            let r = col.half.x;
            let d = length(pos_local) - r;
            dist = d;
            normal_local = normalize(pos_local);
        } else if (col.shape_type == 1u) {
            // Box: half-extents = col.half.xyz
            let he = col.half.xyz;
            let q  = abs(pos_local) - he;
            dist   = length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
            // Normal: face mais próxima
            let ax = abs(pos_local);
            if (ax.x > ax.y && ax.x > ax.z) { normal_local = vec3f(sign(pos_local.x), 0.0, 0.0); }
            else if (ax.y > ax.z)            { normal_local = vec3f(0.0, sign(pos_local.y), 0.0); }
            else                             { normal_local = vec3f(0.0, 0.0, sign(pos_local.z)); }
        } else if (col.shape_type == 2u) {
            // Plano: normal local = Y+, half.x = offset
            dist = pos_local.y - col.half.x;
            normal_local = vec3f(0.0, 1.0, 0.0);
        }

        if (dist < 0.0) {
            // Transforma normal para world
            let normal_world = normalize((world * vec4f(normal_local, 0.0)).xyz);
            pos -= dist * normal_world;
            let vel_n = dot(vel, normal_world);
            if (vel_n < 0.0) {
                vel -= (1.0 + restitution) * vel_n * normal_world;
            }
        }
    }

    particles[i].pos = vec4f(pos, particles[i].pos.w);
    particles[i].vel = vec4f(vel, 0.0);
}
`;
