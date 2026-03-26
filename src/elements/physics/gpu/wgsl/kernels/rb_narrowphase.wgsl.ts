/**
 * Kernel WGSL: rb_narrowphase — detecção de contatos corpo rígido × collider estático.
 *
 * Executa 1× por substep.
 * gid.x indexa [0, body_count * collider_count).
 * Cada thread gerencia o slot contacts[rb_i * collider_count + col_j].
 *
 * Para cada par (corpo, collider):
 *   1. Pula se inv_mass == 0 (cinemático)
 *   2. Transforma pos_pred para espaço local do collider via inv_world_mat
 *   3. Avalia SDF e gradiente
 *   4. Contato especulativo: ativa se d < 0 OU d_speculative < 0 (predictive_threshold > 0)
 *   5. Se ativo: escreve contato com depth_eff, preserva lambdas (warm-starting)
 *   6. Se inativo: marca slot inativo, zera lambdas
 *
 * Bind groups:
 *   @group(0) @binding(0) — RBSimParams    (uniform)
 *   @group(0) @binding(1) — RigidBody[]    (storage read_write)
 *   @group(0) @binding(2) — ColliderDesc[] (storage read)
 *   @group(0) @binding(3) — RBContact[]    (storage read_write)
 *
 * Dispatch: ceil(body_count * collider_count / 64) workgroups.
 *
 * Depende de: RBSimParams, RigidBody, ColliderDesc, RBContact,
 *             sdf.wgsl (eval_sdf, sdf_gradient), mat.wgsl (mat4_upper3x3_transform).
 * Define: combine_restitution (auxiliar local).
 */
export const WGSL_KERNEL_RB_NARROWPHASE = /* wgsl */`

@group(0) @binding(0) var<uniform>             rb_params: RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:    array<RigidBody>;
@group(0) @binding(2) var<storage, read>       colliders: array<ColliderDesc>;
@group(0) @binding(3) var<storage, read_write> contacts:  array<RBContact>;

@compute @workgroup_size(64)
fn rb_narrowphase_main(@builtin(global_invocation_id) gid: vec3u) {
    let idx = gid.x;
    if (idx >= rb_params.max_contacts) { return; }

    let col_count = rb_params.collider_count;
    if (col_count == 0u) { return; }

    let rb_i  = idx / col_count;
    let col_j = idx % col_count;

    if (rb_i >= rb_params.body_count) { return; }

    let slot = rb_i * col_count + col_j;

    let inv_mass = bodies[rb_i].pos.w;
    if (inv_mass == 0.0) {
        // Cinemático — desativa slot sem zerar lambdas (não será usado em rb_solve)
        contacts[slot].is_active = 0u;
        return;
    }

    let col = colliders[col_j];

    // Auto-colisão: o CM de um corpo dinâmico está sempre dentro da sua própria forma
    // (eval_sdf = -min(halfExtents) < 0), gerando contatos falsos que interferem com
    // a resposta de colisão real. Filtra pares onde o collider pertence ao mesmo corpo.
    if (col.body_owner_idx == rb_i) {
        contacts[slot].is_active = 0u;
        return;
    }

    // Transforma pos_pred para espaço local do collider
    let world_pred = bodies[rb_i].pos_pred.xyz;
    let local_pred = (col.inv_world_mat * vec4f(world_pred, 1.0)).xyz;

    let d = eval_sdf(local_pred, col.shape_type, col.half);

    // Calcula normal no espaço mundo (necessário para contatos especulativos)
    let grad_local = sdf_gradient(local_pred, d, col.shape_type, col.half);
    let wn_raw     = mat4_upper3x3_transform(col.world_mat, grad_local);
    let wn_len     = length(wn_raw);
    if (wn_len < 1e-8) {
        contacts[slot].is_active = 0u;
        return;
    }
    let wn = wn_raw / wn_len;

    // Contato especulativo: ativa se penetrando (d < 0) OU se o corpo chegará à superfície no próximo substep
    let v_along_n     = dot(bodies[rb_i].vel.xyz, wn);  // negativo = aproximando
    let d_speculative = d + v_along_n * rb_params.gravity.w;  // gravity.w = dtSub

    // Desativar se: sem penetração atual E sem contato iminente (ou predictive desativado)
    let predictive_on = rb_params.predictive_threshold > 0.0;
    if (d >= 0.0 && (d_speculative >= 0.0 || !predictive_on)) {
        // Sem penetração — desativa slot e zera lambdas (sem warm-starting inválido)
        contacts[slot].is_active = 0u;
        contacts[slot].point.w   = 0.0;
        contacts[slot].lambda_tx = 0.0;
        contacts[slot].lambda_ty = 0.0;
        return;
    }

    // Profundidade efetiva: usa d_speculative quando contato é especulativo
    let depth_eff = select(d, d_speculative, d >= 0.0);

    // Ponto de contato: pos_pred projetado para a superfície do collider
    let contact_point = world_pred - depth_eff * wn;

    // Preserva lambdas do frame anterior se o slot estava ativo (warm-starting)
    let prev_lambda_n  = contacts[slot].point.w;
    let prev_lambda_tx = contacts[slot].lambda_tx;
    let prev_lambda_ty = contacts[slot].lambda_ty;
    let was_active     = contacts[slot].is_active;

    let lambda_n  = select(0.0, prev_lambda_n,  was_active == 1u);
    let lambda_tx = select(0.0, prev_lambda_tx, was_active == 1u);
    let lambda_ty = select(0.0, prev_lambda_ty, was_active == 1u);

    contacts[slot].normal     = vec4f(wn, -depth_eff);  // w=profundidade (positivo = penetração)
    contacts[slot].point      = vec4f(contact_point, lambda_n);
    contacts[slot].rb_idx     = rb_i;
    contacts[slot].col_idx    = col_j;
    contacts[slot].is_active  = 1u;
    contacts[slot].feature_id = 0u;
    contacts[slot].lambda_tx   = lambda_tx;
    contacts[slot].lambda_ty   = lambda_ty;
    contacts[slot].restitution = combine_restitution(rb_params.restitution, rb_params.restitution);
    contacts[slot]._pad2       = 0.0;
    contacts[slot]._pad3       = 0.0;
    contacts[slot]._pad4       = 0.0;
}

// Restituição combinada do par de contato: usa max (padrão Bullet/Box2D).
fn combine_restitution(a: f32, b: f32) -> f32 {
    return max(a, b);
}
`;
