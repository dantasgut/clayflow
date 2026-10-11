// portado de legacy/elements/physics/gpu/wgsl/structs/rb_sim_params.wgsl.ts
struct RBSimParams {
    gravity:                vec4f,  // xyz=aceleração gravitacional, w=dt (substep)
    body_count:             u32,
    collider_count:         u32,
    max_contacts:           u32,    // capacidade da lista compactada de contatos (spec 004, R19)
    solve_iters:            u32,    // iterações Gauss-Seidel por substep (K)
    dt_frame:               f32,    // dt do frame inteiro (= gravity.w * substeps)
    restitution:            f32,    // coeficiente de restituição [0, 1]
    penetration_slop:       f32,    // margem de tolerância de penetração (subtrai do depth no XPBD)
    linear_damping:         f32,    // taxa de amortecimento linear por substep (1/s)
    angular_damping:        f32,    // taxa de amortecimento angular por substep (1/s)
    contact_stamp:          u32,    // carimbo do substep corrente (warm start por tabela hash)
    predictive_threshold:   f32,    // margem especulativa: d_proj < 0 ativa contato iminente
    restitution_threshold:  f32,    // abaixo desta velocidade de aproximação (m/s), e = 0
    sleep_lin_threshold:    f32,    // vel abaixo deste valor (m/s) → zerar (pseudo-sleep, 0=off)
    warm_capacity:          u32,    // entradas da tabela de warm start (potência de 2)
    baumgarte_beta:         f32,    // fator de correção Baumgarte [0.1–0.3] (LCP/PGS)
    warm_start_factor:      f32,    // escala warm-start [0.8–1.0] (LCP/PGS)
}
