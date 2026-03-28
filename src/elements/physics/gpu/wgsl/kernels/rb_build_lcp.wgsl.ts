/**
 * Kernel WGSL: rb_build_lcp — pré-computa bias vector e diagonais de Delassus.
 *
 * Executa 1× por substep, ANTES de rb_solve, em paralelo por contato ativo.
 * Para cada contato ativo:
 *   1. Calcula velocidade relativa na normal (contact_point_velocity de impulse.wgsl)
 *   2. Calcula bias b[i] via lcp_bias (Baumgarte + restituição)
 *   3. Pré-computa diagonal_n, diagonal_t1 e diagonal_t2 (Delassus normal e tangenciais)
 *      e escreve nos campos contacts[i].diagonal_n / diagonal_t1 / diagonal_t2
 *
 * Nota: contatos corpo rígido × collider estático têm o collider com inv_mass=0 e I_inv=0,
 * portanto a diagonal de Delassus é apenas a contribuição do corpo dinâmico.
 *
 * Bind groups:
 *   @group(0) @binding(0) — RBSimParams  (uniform)
 *   @group(0) @binding(1) — RigidBody[]  (storage read)
 *   @group(0) @binding(2) — RBContact[]  (storage read_write)
 *   @group(0) @binding(3) — float[]      (storage write) — bias vector b[max_contacts]
 *
 * Dispatch: ceil(max_contacts / 64) workgroups.
 *
 * Depende de: RBSimParams, RigidBody, RBContact,
 *             lcp.wgsl (lcp_bias),
 *             impulse.wgsl (contact_point_velocity),
 *             xpbd.wgsl (rigid_generalized_mass),
 *             contact_math.wgsl (tangent_orthogonal).
 */
export const WGSL_KERNEL_RB_BUILD_LCP = /* wgsl */`

@group(0) @binding(0) var<uniform>             rb_params: RBSimParams;
@group(0) @binding(1) var<storage, read>       bodies:    array<RigidBody>;
@group(0) @binding(2) var<storage, read_write> contacts:  array<RBContact>;
@group(0) @binding(3) var<storage, read_write> b_vec:     array<f32>;

@compute @workgroup_size(64, 1, 1)
fn rb_build_lcp(@builtin(global_invocation_id) gid: vec3u) {
    let ci = gid.x;
    if (ci >= rb_params.max_contacts) { return; }

    // Contato inativo — zera bias e diagonais (rb_solve vai ignorar, mas limpa resíduos)
    if (contacts[ci].is_active == 0u) {
        b_vec[ci]                = 0.0;
        contacts[ci].diagonal_n  = 1.0;  // valor seguro não-zero para evitar divisão por zero
        contacts[ci].diagonal_t1 = 1.0;
        contacts[ci].diagonal_t2 = 1.0;
        return;
    }

    let rb_i     = contacts[ci].rb_idx;
    let inv_mass = bodies[rb_i].pos.w;
    let I_inv    = bodies[rb_i].I_inv.xyz;

    // Vetor CM_i → ponto de contato (world frame)
    let ra = contacts[ci].point.xyz - bodies[rb_i].pos_pred.xyz;

    let n   = contacts[ci].normal.xyz;
    // normal.w armazena -depth_eff. Para penetração real, depth_eff < 0 → normal.w > 0.
    // lcp_bias espera gap < 0 = penetração (signed distance), então negamos para recuperar depth_eff.
    let gap = -contacts[ci].normal.w;  // = depth_eff: < 0 quando penetrando

    // ── Diagonais de Delassus ──────────────────────────────────────────────
    // Para contato corpo rígido × collider estático, o collider tem massa infinita
    // (inv_mass_static = 0, I_inv_static = 0), portanto só a contribuição do corpo dinâmico.
    contacts[ci].diagonal_n = rigid_generalized_mass(ra, n, inv_mass, I_inv);

    // Constrói duas tangentes ortogonais e calcula diagonais tangenciais independentes.
    // I_x ≠ I_y ≠ I_z em geral: w(t1) ≠ w(t2) — divisor único causaria under/over-correction.
    let t1 = tangent_orthogonal(n);
    let t2 = cross(n, t1);
    contacts[ci].diagonal_t1 = rigid_generalized_mass(ra, t1, inv_mass, I_inv);
    contacts[ci].diagonal_t2 = rigid_generalized_mass(ra, t2, inv_mass, I_inv);

    // ── Velocidade relativa na normal ──────────────────────────────────────
    let v_cp    = contact_point_velocity(bodies[rb_i].vel.xyz, bodies[rb_i].omega.xyz, ra);
    let v_rel_n = dot(v_cp, n);

    // ── Bias b[i] ─────────────────────────────────────────────────────────
    b_vec[ci] = lcp_bias(gap, v_rel_n, contacts[ci].restitution, rb_params);
}
`;
