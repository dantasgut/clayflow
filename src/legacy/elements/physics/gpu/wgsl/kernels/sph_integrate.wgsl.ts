/**
 * Kernel WGSL: sph_integrate — integração semi-implícita + correção XSPH.
 *
 * vᵢ += Δt · force[i].xyz     (aceleração acumulada)
 * vᵢ += color[i].xyz           (correção XSPH)
 * xᵢ += Δt · vᵢ
 *
 * Bind groups:
 *   @group(0) @binding(0) — SPHSimParams (uniform)
 *   @group(1) @binding(0) — particles: array<SPHParticle> (read_write)
 *
 * Dispatch: ceil(particle_count / 64)
 */
export const WGSL_KERNEL_SPH_INTEGRATE = /* wgsl */`

@group(0) @binding(0) var<uniform>             sph_params: SPHSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<SPHParticle>;

@compute @workgroup_size(64)
fn sph_integrate_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= sph_params.counts.x) { return; }

    let dt = sph_params.gravity_dt.w;

    var vel = particles[i].vel.xyz;
    let acc = particles[i].force.xyz;
    let xsph = particles[i].color.xyz;

    vel += dt * acc + xsph;
    let pos = particles[i].pos.xyz + dt * vel;

    particles[i].vel = vec4f(vel, particles[i].vel.w);
    particles[i].pos = vec4f(pos, particles[i].pos.w);

    // Zera força acumulada para próximo substep
    particles[i].force = vec4f(0.0);
    particles[i].color = vec4f(0.0);
}
`;
