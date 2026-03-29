/**
 * Kernel WGSL: fem_solve — resolve restrições FEM (hidrostática + desviadora) por tetraedro.
 *
 * Executa N vezes por substep (uma por cor do graph coloring).
 * Cada workgroup processa um elemento independente na mesma cor.
 *
 * Para cada elemento ativo (1 thread por workgroup, serial no elemento):
 *   1. Lê posições previstas dos 4 nós
 *   2. Computa D_s, F = D_s × D_m_inv, J = det(F), ||F||_F
 *   3. Resolve C_h (hidrostática): Δλ_h, aplica correção a pred dos nós
 *   4. Relê posições (C_h modificou), resolve C_d (desviadora): Δλ_d, aplica
 *   5. Atualiza lambdas no FEMElement (warm start para próximo substep)
 *
 * Bind groups:
 *   @group(0) @binding(0) — FEMSimParams  (uniform)
 *   @group(0) @binding(1) — Particle[]    (storage read_write) — nós
 *   @group(0) @binding(2) — FEMElement[]  (storage read_write) — elementos
 *   @group(1) @binding(0) — ColorRange    (uniform)            — offset/count desta cor
 *
 * Dispatch: ceil(count_for_this_color / 1) workgroups — 1 workgroup por elemento.
 * workgroup_size(1): o solve de um elemento T4 é serial (4 nós acoplados).
 *
 * Depende de: FEMSimParams, Particle, FEMElement, linalg, fem_kinematics, fem_xpbd.
 */
export const WGSL_KERNEL_FEM_SOLVE = /* wgsl */`

struct ColorRange {
    offset: u32,
    count:  u32,
    _pad0:  u32,
    _pad1:  u32,
}

@group(0) @binding(0) var<uniform>             fem_params: FEMSimParams;
@group(0) @binding(1) var<storage, read_write> nodes:      array<Particle>;
@group(0) @binding(2) var<storage, read_write> elements:   array<FEMElement>;
@group(1) @binding(0) var<uniform>             color_range: ColorRange;

@compute @workgroup_size(1)
fn fem_solve_main(@builtin(global_invocation_id) gid: vec3u) {
    let local_idx = gid.x;
    if (local_idx >= color_range.count) { return; }

    let elem_idx = color_range.offset + local_idx;
    if (elem_idx >= fem_params.elem_count) { return; }

    let elem = elements[elem_idx];

    let n0 = elem.node_indices.x;
    let n1 = elem.node_indices.y;
    let n2 = elem.node_indices.z;
    let n3 = elem.node_indices.w;

    let dt     = fem_params.dt_sub;
    let dt2    = dt * dt;

    // rest_vol e compliances lidos antes de alpha_tilde (dependência de ordem).
    let rest_vol  = elem.Bm_col0.w;
    let mu_e      = elem.Bm_col1.w;
    let lambda_e  = elem.Bm_col2.w;
    let alpha_h   = select(fem_params.alpha_h, 1.0 / (lambda_e + 2.0 * mu_e), mu_e > 0.0);
    let alpha_d   = select(fem_params.alpha_d, 1.0 / mu_e,                    mu_e > 0.0);

    // Incorpora V₀ (volume de repouso) na compliance normalizada.
    // Fórmula XPBD-FEM (Macklin 2021): α_tilde = α / (dt² × V₀)
    // C deve ser passado sem fator V₀ (já está embutido em alpha_tilde).
    let V0_safe = max(rest_vol, 1e-10);
    let alpha_h_tilde = alpha_h / (dt2 * V0_safe);
    let alpha_d_tilde = alpha_d / (dt2 * V0_safe);

    // ── Lê posições previstas ─────────────────────────────────────────────────
    var p0 = nodes[n0].pred.xyz;
    var p1 = nodes[n1].pred.xyz;
    var p2 = nodes[n2].pred.xyz;
    var p3 = nodes[n3].pred.xyz;

    let w0 = nodes[n0].pos.w;
    let w1 = nodes[n1].pos.w;
    let w2 = nodes[n2].pos.w;
    let w3 = nodes[n3].pos.w;

    // D_m_inv — armazenada por colunas no FEMElement
    let Dm_inv = mat3_from_cols(
        elem.Bm_col0.xyz,
        elem.Bm_col1.xyz,
        elem.Bm_col2.xyz,
    );

    // A fórmula do gradiente requer as LINHAS de D_m_inv:
    //   ∂J/∂p_{k+1} = J × F^{-T} × (linha k de D_m_inv)
    //   ∂Cd/∂p_{k+1} = (F × linha k de D_m_inv) / ||F||_F
    // Em WGSL (coluna-maior), Dm_inv_T[k] = coluna k da transposta = linha k da original.
    let Dm_inv_T = mat3_transpose(Dm_inv);

    // ── Restrição hidrostática (volume) ──────────────────────────────────────
    let Ds_h  = compute_Ds(p0, p1, p2, p3);
    let F_h   = compute_F(Ds_h, Dm_inv);
    var J     = compute_J(F_h);
    // Clamp J to avoid passing near-zero/negative values to grad_hydrostatic.
    // grad_hydrostatic already guards, but clamping J here also fixes C_h sign.
    let J_clamped = max(J, 0.02);
    let C_h   = J_clamped - 1.0;

    // Gradientes gh_j = J × (F_inv_T × linha_j(D_m_inv)); g0 = -(g1+g2+g3)
    let gh1 = grad_hydrostatic(F_h, J_clamped, Dm_inv_T[0]);
    let gh2 = grad_hydrostatic(F_h, J_clamped, Dm_inv_T[1]);
    let gh3 = grad_hydrostatic(F_h, J_clamped, Dm_inv_T[2]);
    let gh0 = grad_node0(gh1, gh2, gh3);

    let w_sum_h = w0 * dot(gh0, gh0)
                + w1 * dot(gh1, gh1)
                + w2 * dot(gh2, gh2)
                + w3 * dot(gh3, gh3);

    let lambda_h_prev = elem.lambdas.x;
    let dlambda_h = fem_delta_lambda(C_h, w_sum_h, alpha_h_tilde, lambda_h_prev);

    if (abs(dlambda_h) > 1e-18) {
        p0 += w0 * dlambda_h * gh0;
        p1 += w1 * dlambda_h * gh1;
        p2 += w2 * dlambda_h * gh2;
        p3 += w3 * dlambda_h * gh3;
    }

    // ── Restrição desviadora (forma) ─────────────────────────────────────────
    let Ds_d  = compute_Ds(p0, p1, p2, p3);
    let F_d   = compute_F(Ds_d, Dm_inv);
    let F_norm = mat3_frobenius_norm(F_d);
    let C_d   = F_norm - sqrt(3.0);

    let gd1 = grad_deviatoric(F_d, F_norm, Dm_inv_T[0]);
    let gd2 = grad_deviatoric(F_d, F_norm, Dm_inv_T[1]);
    let gd3 = grad_deviatoric(F_d, F_norm, Dm_inv_T[2]);
    let gd0 = grad_node0(gd1, gd2, gd3);

    let w_sum_d = w0 * dot(gd0, gd0)
                + w1 * dot(gd1, gd1)
                + w2 * dot(gd2, gd2)
                + w3 * dot(gd3, gd3);

    let lambda_d_prev = elem.lambdas.y;
    let dlambda_d = fem_delta_lambda(C_d, w_sum_d, alpha_d_tilde, lambda_d_prev);

    if (abs(dlambda_d) > 1e-18) {
        p0 += w0 * dlambda_d * gd0;
        p1 += w1 * dlambda_d * gd1;
        p2 += w2 * dlambda_d * gd2;
        p3 += w3 * dlambda_d * gd3;
    }

    // ── Escreve posições corrigidas ──────────────────────────────────────────
    nodes[n0].pred = vec4f(p0, nodes[n0].pred.w);
    nodes[n1].pred = vec4f(p1, nodes[n1].pred.w);
    nodes[n2].pred = vec4f(p2, nodes[n2].pred.w);
    nodes[n3].pred = vec4f(p3, nodes[n3].pred.w);

    // ── Atualiza lambdas (warm start) ────────────────────────────────────────
    elements[elem_idx].lambdas = vec4f(
        lambda_h_prev + dlambda_h,
        lambda_d_prev + dlambda_d,
        0.0, 0.0,
    );
}
`;
