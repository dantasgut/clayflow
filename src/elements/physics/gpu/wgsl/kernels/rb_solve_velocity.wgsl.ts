/**
 * Kernel WGSL: rb_solve_velocity — aplica fricção de Coulomb em espaço de velocidade.
 *
 * Executa 1× por frame APÓS rb_velocity_recovery.
 * Opera nas velocidades já derivadas (vel, omega) — não em posições previstas.
 *
 * Para cada contato ativo com lambda_n > 0:
 *   1. Calcula velocidade no ponto de contato: v_cp = vel + ω × r
 *   2. Decompõe em normal (v_n) e tangencial (v_tan)
 *   3. Calcula impulso para parar deslizamento: j_stop = |v_tan| / w_t
 *   4. Limita pelo cone de Coulomb: j_max = μ × λ_n / dt
 *   5. Aplica impulso j = min(j_stop, j_max) na direção −t
 *
 * Desacoplamento posição/velocidade (Müller 2020):
 *   rb_solve  → corrige penetração (posição)
 *   rb_solve_velocity → corrige deslizamento (velocidade) com λ_n já estabilizado
 *
 * Bind groups:
 *   @group(0) @binding(0) — RBSimParams  (uniform)
 *   @group(0) @binding(1) — RigidBody[]  (storage read_write)
 *   @group(0) @binding(2) — RBContact[]  (storage read_write)
 *
 * Dispatch: 1 workgroup (serial) — 1× por frame.
 *
 * Depende de: RBSimParams, RigidBody, RBContact,
 *             xpbd.wgsl (rigid_generalized_mass),
 *             impulse.wgsl (contact_point_velocity).
 */
export const WGSL_KERNEL_RB_SOLVE_VELOCITY = /* wgsl */`

@group(0) @binding(0) var<uniform>             rb_params: RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:    array<RigidBody>;
@group(0) @binding(2) var<storage, read_write> contacts:  array<RBContact>;

@compute @workgroup_size(1)
fn rb_solve_velocity_main(@builtin(global_invocation_id) _gid: vec3u) {
    let dt = rb_params.dt_frame;
    if (dt < 1e-12) { return; }

    for (var ci = 0u; ci < rb_params.max_contacts; ci++) {
        if (contacts[ci].is_active == 0u) { continue; }

        let rb_i     = contacts[ci].rb_idx;
        let inv_mass = bodies[rb_i].pos.w;
        if (inv_mass == 0.0) { continue; }  // cinemático — ignora

        let n     = contacts[ci].normal.xyz;
        // r relativo à posição ATUAL (já comitada por rb_substep_update)
        let r     = contacts[ci].point.xyz - bodies[rb_i].pos.xyz;
        let I_inv = bodies[rb_i].I_inv.xyz;

        let w = rigid_generalized_mass(r, n, inv_mass, I_inv);
        if (w < 1e-12) { continue; }

        // Velocidade no ponto de contato (vel/omega já derivados por rb_velocity_recovery)
        var v_cp    = contact_point_velocity(bodies[rb_i].vel.xyz, bodies[rb_i].omega.xyz, r);
        var v_n_val = dot(v_cp, n);

        // ── 1. Correção de velocidade normal (restituição e=0) ────────────────
        // Roda para QUALQUER contato ativo, independente de lambda_n.
        // Na primeira colisão do frame lambda_n=0 mas a velocidade de aproximação
        // já existe e deve ser zerada — caso contrário o corpo pula com e>0.
        if (v_n_val < -0.01) {
            let j_n = -v_n_val / w;
            bodies[rb_i].vel = vec4f(
                bodies[rb_i].vel.xyz + n * (j_n * inv_mass),
                bodies[rb_i].vel.w,
            );
            let rxn_n = cross(r, n);
            bodies[rb_i].omega = vec4f(
                bodies[rb_i].omega.xyz + vec3f(
                    rxn_n.x * I_inv.x * j_n,
                    rxn_n.y * I_inv.y * j_n,
                    rxn_n.z * I_inv.z * j_n,
                ),
                bodies[rb_i].omega.w,
            );
            // Recalcula v_cp com velocidade já corrigida
            v_cp    = contact_point_velocity(bodies[rb_i].vel.xyz, bodies[rb_i].omega.xyz, r);
            v_n_val = dot(v_cp, n);
        }

        // ── 2. Fricção de Coulomb ─────────────────────────────────────────────
        // Fricção requer lambda_n > 0 (cone de Coulomb: |j_t| ≤ μ * λ_n / dt).
        let lambda_n = contacts[ci].point.w;
        let mu = bodies[rb_i].mat_props.y;
        if (mu <= 0.0 || lambda_n <= 1e-10 || v_n_val > 0.01) { continue; }

        let v_tan     = v_cp - v_n_val * n;
        let v_tan_len = length(v_tan);
        if (v_tan_len < 1e-8) { continue; }

        let t   = v_tan / v_tan_len;
        let w_t = rigid_generalized_mass(r, t, inv_mass, I_inv);
        if (w_t < 1e-12) { continue; }

        let j_stop = v_tan_len / w_t;
        let j_max  = mu * lambda_n / dt;
        let j_t = min(j_stop, j_max);

        bodies[rb_i].vel = vec4f(
            bodies[rb_i].vel.xyz - t * (j_t * inv_mass),
            bodies[rb_i].vel.w,
        );

        let rxn = cross(r, t);
        bodies[rb_i].omega = vec4f(
            bodies[rb_i].omega.xyz - vec3f(
                rxn.x * I_inv.x * j_t,
                rxn.y * I_inv.y * j_t,
                rxn.z * I_inv.z * j_t,
            ),
            bodies[rb_i].omega.w,
        );
    }
}
`;
