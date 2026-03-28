/**
 * Kernel WGSL: rb_solve_lcp — PGS-LCP com warm start para contatos corpo rígido.
 *
 * Substituto de rb_solve para o pipeline LCP — arquivo separado, rb_solve.wgsl.ts
 * não é modificado (pipeline SI/XPBD continua intacto).
 *
 * Executa 1× por substep (serial — @workgroup_size(1,1,1)).
 * Loop interno de K=rb_params.solve_iters iterações PGS-LCP, serial por design
 * (Gauss-Seidel sequencial: cada contato lê o estado atualizado pelo anterior).
 *
 * ## Sequência por iteração
 *
 * Antes da 1ª iteração (k==0): aplica warm start via lambdas persistidos.
 * Para cada iteração k:
 *   Para cada contato ativo ci:
 *     1. Velocidade relativa na normal: j_v = dot(contact_point_velocity, n)
 *     2. Passo PGS normal: lcp_pgs_step → delta_lambda_n, nova lambda_n
 *     3. Aplica impulso normal (vel + omega)
 *     4. Velocidade relativa tangencial: j_v_t (vec2: t1, t2)
 *     5. Passo PGS fricção: lcp_pgs_step_friction → delta_lambda_t, nova lambda_t
 *     6. Aplica impulso tangencial (vel + omega)
 *
 * ## Bind groups
 *
 *   @group(0) @binding(0) — RBSimParams  (uniform)
 *   @group(0) @binding(1) — RigidBody[]  (storage read_write)
 *   @group(0) @binding(2) — RBContact[]  (storage read_write)
 *   @group(0) @binding(3) — float[]      (storage read)  — bias vector b[max_contacts]
 *
 * Dispatch: 1 workgroup (serial Gauss-Seidel) — 1× por substep.
 *
 * Depende de: RBSimParams, RigidBody, RBContact,
 *             lcp.wgsl (lcp_pgs_step, lcp_pgs_step_friction),
 *             impulse.wgsl (contact_point_velocity),
 *             xpbd.wgsl (rigid_generalized_mass),
 *             contact_math.wgsl (tangent_orthogonal),
 *             quat.wgsl (não necessário — opera em velocidades, não em posições).
 */
export const WGSL_KERNEL_RB_SOLVE_LCP = /* wgsl */`

@group(0) @binding(0) var<uniform>             rb_params: RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:    array<RigidBody>;
@group(0) @binding(2) var<storage, read_write> contacts:  array<RBContact>;
@group(0) @binding(3) var<storage, read>       b_vec:     array<f32>;

@compute @workgroup_size(1, 1, 1)
fn rb_solve_lcp_main(@builtin(global_invocation_id) _gid: vec3u) {

    // ── Warm start — antes da 1ª iteração PGS ─────────────────────────────────
    // Aplica impulsos acumulados do frame anterior escalonados por warm_start_factor.
    // Inicializa as velocidades numa solução inicial próxima da convergida.
    let wsf = rb_params.warm_start_factor;
    if (wsf > 0.0) {
        for (var ci = 0u; ci < rb_params.max_contacts; ci++) {
            if (contacts[ci].is_active == 0u) { continue; }

            let rb_i     = contacts[ci].rb_idx;
            let inv_mass = bodies[rb_i].pos.w;
            if (inv_mass == 0.0) { continue; }

            let n      = contacts[ci].normal.xyz;
            let lambda_n  = contacts[ci].point.w  * wsf;
            let lambda_tx = contacts[ci].lambda_tx * wsf;
            let lambda_ty = contacts[ci].lambda_ty * wsf;

            // Tangentes ortogonais para aplicar impulso de warm-start tangencial
            let t1 = tangent_orthogonal(n);
            let t2 = cross(n, t1);

            let I_inv = bodies[rb_i].I_inv.xyz;
            let r     = contacts[ci].point.xyz - bodies[rb_i].pos_pred.xyz;

            // Impulso normal
            let p_n = n * lambda_n;
            bodies[rb_i].vel   = vec4f(bodies[rb_i].vel.xyz   + p_n * inv_mass,       bodies[rb_i].vel.w);
            bodies[rb_i].omega = vec4f(bodies[rb_i].omega.xyz + cross(r, p_n) * I_inv, bodies[rb_i].omega.w);

            // Impulso tangencial (componente t1)
            let p_t1 = t1 * lambda_tx;
            bodies[rb_i].vel   = vec4f(bodies[rb_i].vel.xyz   + p_t1 * inv_mass,        bodies[rb_i].vel.w);
            bodies[rb_i].omega = vec4f(bodies[rb_i].omega.xyz + cross(r, p_t1) * I_inv,  bodies[rb_i].omega.w);

            // Impulso tangencial (componente t2)
            let p_t2 = t2 * lambda_ty;
            bodies[rb_i].vel   = vec4f(bodies[rb_i].vel.xyz   + p_t2 * inv_mass,        bodies[rb_i].vel.w);
            bodies[rb_i].omega = vec4f(bodies[rb_i].omega.xyz + cross(r, p_t2) * I_inv,  bodies[rb_i].omega.w);

            // Reação sobre o corpo B (contato corpo-a-corpo)
            let rb_j_ws = contacts[ci].rb_idx_b;
            if (rb_j_ws != 0xFFFFFFFFu && rb_j_ws < rb_params.body_count) {
                let inv_mass_b = bodies[rb_j_ws].pos.w;
                if (inv_mass_b > 0.0) {
                    let I_inv_b = bodies[rb_j_ws].I_inv.xyz;
                    let rb      = contacts[ci].point.xyz - bodies[rb_j_ws].pos_pred.xyz;
                    bodies[rb_j_ws].vel   = vec4f(bodies[rb_j_ws].vel.xyz   - p_n  * inv_mass_b,         bodies[rb_j_ws].vel.w);
                    bodies[rb_j_ws].omega = vec4f(bodies[rb_j_ws].omega.xyz - cross(rb, p_n)  * I_inv_b, bodies[rb_j_ws].omega.w);
                    bodies[rb_j_ws].vel   = vec4f(bodies[rb_j_ws].vel.xyz   - p_t1 * inv_mass_b,         bodies[rb_j_ws].vel.w);
                    bodies[rb_j_ws].omega = vec4f(bodies[rb_j_ws].omega.xyz - cross(rb, p_t1) * I_inv_b, bodies[rb_j_ws].omega.w);
                    bodies[rb_j_ws].vel   = vec4f(bodies[rb_j_ws].vel.xyz   - p_t2 * inv_mass_b,         bodies[rb_j_ws].vel.w);
                    bodies[rb_j_ws].omega = vec4f(bodies[rb_j_ws].omega.xyz - cross(rb, p_t2) * I_inv_b, bodies[rb_j_ws].omega.w);
                }
            }
        }
    }

    // ── Loop PGS — K iterações ────────────────────────────────────────────────
    for (var k = 0u; k < rb_params.solve_iters; k++) {
        for (var ci = 0u; ci < rb_params.max_contacts; ci++) {
            if (contacts[ci].is_active == 0u) { continue; }

            let rb_i     = contacts[ci].rb_idx;
            let inv_mass = bodies[rb_i].pos.w;
            if (inv_mass == 0.0) { continue; }

            let n     = contacts[ci].normal.xyz;
            let r     = contacts[ci].point.xyz - bodies[rb_i].pos_pred.xyz;
            let I_inv = bodies[rb_i].I_inv.xyz;
            let rb_j  = contacts[ci].rb_idx_b;  // 0xFFFFFFFFu se estático

            // ── Normal: passo PGS-LCP ──────────────────────────────────────────
            let v_cp_a = contact_point_velocity(bodies[rb_i].vel.xyz, bodies[rb_i].omega.xyz, r);
            var j_v    = dot(v_cp_a, n);

            // Para contatos corpo-a-corpo: velocidade relativa v_A - v_B
            var rb_valid = false;
            var inv_mass_b = 0.0;
            var I_inv_b    = vec3f(0.0);
            var rb         = vec3f(0.0);
            if (rb_j != 0xFFFFFFFFu && rb_j < rb_params.body_count) {
                inv_mass_b = bodies[rb_j].pos.w;
                if (inv_mass_b > 0.0) {
                    rb_valid = true;
                    I_inv_b  = bodies[rb_j].I_inv.xyz;
                    rb       = contacts[ci].point.xyz - bodies[rb_j].pos_pred.xyz;
                    let v_cp_b = contact_point_velocity(bodies[rb_j].vel.xyz, bodies[rb_j].omega.xyz, rb);
                    j_v       -= dot(v_cp_b, n);
                }
            }

            let bias    = b_vec[ci];
            let a_kk    = contacts[ci].diagonal_n;
            let lam_n   = contacts[ci].point.w;

            let pgs_n   = lcp_pgs_step(j_v, bias, a_kk, lam_n);
            let d_lam_n = pgs_n.x;
            let new_lam_n = pgs_n.y;

            contacts[ci].point.w = new_lam_n;

            // Aplica impulso normal a A; reação a B se dinâmico
            if (abs(d_lam_n) > 1e-12) {
                let p_n = n * d_lam_n;
                bodies[rb_i].vel   = vec4f(bodies[rb_i].vel.xyz   + p_n * inv_mass,       bodies[rb_i].vel.w);
                bodies[rb_i].omega = vec4f(bodies[rb_i].omega.xyz + cross(r, p_n) * I_inv, bodies[rb_i].omega.w);
                if (rb_valid) {
                    bodies[rb_j].vel   = vec4f(bodies[rb_j].vel.xyz   - p_n * inv_mass_b,         bodies[rb_j].vel.w);
                    bodies[rb_j].omega = vec4f(bodies[rb_j].omega.xyz - cross(rb, p_n) * I_inv_b,  bodies[rb_j].omega.w);
                }
            }

            // ── Fricção: passo PGS cone de Coulomb ────────────────────────────
            let mu = bodies[rb_i].mat_props.y;
            if (mu <= 0.0) { continue; }

            // Velocidade tangencial relativa após impulso normal
            let t1     = tangent_orthogonal(n);
            let t2     = cross(n, t1);
            let v_cp2  = contact_point_velocity(bodies[rb_i].vel.xyz, bodies[rb_i].omega.xyz, r);
            var j_v_t  = vec2f(dot(v_cp2, t1), dot(v_cp2, t2));
            if (rb_valid) {
                let v_cp2_b = contact_point_velocity(bodies[rb_j].vel.xyz, bodies[rb_j].omega.xyz, rb);
                j_v_t -= vec2f(dot(v_cp2_b, t1), dot(v_cp2_b, t2));
            }

            let a_kk_t  = vec2f(contacts[ci].diagonal_t1, contacts[ci].diagonal_t2);
            let lam_t   = vec2f(contacts[ci].lambda_tx, contacts[ci].lambda_ty);
            let pgs_t   = lcp_pgs_step_friction(j_v_t, a_kk_t, lam_t, new_lam_n, mu);
            let d_lam_t = pgs_t.xy;
            let new_lam_t = pgs_t.zw;

            contacts[ci].lambda_tx = new_lam_t.x;
            contacts[ci].lambda_ty = new_lam_t.y;

            // Aplica impulso tangencial a A; reação a B se dinâmico
            if (length(d_lam_t) > 1e-12) {
                let p_t = t1 * d_lam_t.x + t2 * d_lam_t.y;
                bodies[rb_i].vel   = vec4f(bodies[rb_i].vel.xyz   + p_t * inv_mass,       bodies[rb_i].vel.w);
                bodies[rb_i].omega = vec4f(bodies[rb_i].omega.xyz + cross(r, p_t) * I_inv, bodies[rb_i].omega.w);
                if (rb_valid) {
                    bodies[rb_j].vel   = vec4f(bodies[rb_j].vel.xyz   - p_t * inv_mass_b,         bodies[rb_j].vel.w);
                    bodies[rb_j].omega = vec4f(bodies[rb_j].omega.xyz - cross(rb, p_t) * I_inv_b,  bodies[rb_j].omega.w);
                }
            }
        }
    } // fim loop k
}

`;
