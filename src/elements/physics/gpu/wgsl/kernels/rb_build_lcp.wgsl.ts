/**
 * Kernel WGSL: rb_build_lcp — pré-computa bias vector e diagonais de Delassus.
 *
 * Executa 1× por substep, ANTES de rb_solve, em paralelo por contato ativo.
 * Para cada contato ativo:
 *   1. Calcula velocidade relativa na normal (contact_point_velocity de impulse.wgsl)
 *   2. Calcula bias b[i] via lcp_bias (Baumgarte + restituição)
 *   3. Pré-computa diagonal_n (Delassus normal) e diagonal_t (Delassus tangencial)
 *      e escreve nos campos contacts[i].diagonal_n / diagonal_t
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
 *             xpbd.wgsl (rigid_generalized_mass).
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
        b_vec[ci]               = 0.0;
        contacts[ci].diagonal_n = 1.0;  // valor seguro não-zero para evitar divisão por zero
        contacts[ci].diagonal_t = 1.0;
        return;
    }

    let rb_i     = contacts[ci].rb_idx;
    let inv_mass = bodies[rb_i].pos.w;
    let I_inv    = bodies[rb_i].I_inv.xyz;

    // Vetor CM_i → ponto de contato (world frame)
    let ra = contacts[ci].point.xyz - bodies[rb_i].pos_pred.xyz;

    let n   = contacts[ci].normal.xyz;
    // normal.w = -depth_eff (negativo = penetração)
    let gap = contacts[ci].normal.w;

    // ── Diagonais de Delassus ──────────────────────────────────────────────
    // Para contato corpo rígido × collider estático, o collider tem massa infinita
    // (inv_mass_static = 0, I_inv_static = 0), portanto só a contribuição do corpo dinâmico.
    contacts[ci].diagonal_n = rigid_generalized_mass(ra, n, inv_mass, I_inv);

    // Constrói uma tangente ortogonal à normal e calcula diagonal tangencial
    let t = rb_build_lcp_tangent(n);
    contacts[ci].diagonal_t = rigid_generalized_mass(ra, t, inv_mass, I_inv);

    // ── Velocidade relativa na normal ──────────────────────────────────────
    let v_cp    = contact_point_velocity(bodies[rb_i].vel.xyz, bodies[rb_i].omega.xyz, ra);
    let v_rel_n = dot(v_cp, n);

    // ── Bias b[i] ─────────────────────────────────────────────────────────
    b_vec[ci] = lcp_bias(gap, v_rel_n, contacts[ci].restitution, rb_params);
}

// Constrói um vetor tangente perpendicular a n (método de Frisvad simplificado).
fn rb_build_lcp_tangent(n: vec3f) -> vec3f {
    if (abs(n.x) > 0.57735) {
        return normalize(vec3f(n.y, -n.x, 0.0));
    }
    return normalize(vec3f(0.0, n.z, -n.y));
}
`;
