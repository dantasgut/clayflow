// Spec 004 (R19) — solve LCP paralelo: Jacobi por contato com divisão de massa (Tonge, Benevolenski & Voroshilov,
// "Mass splitting for jitter-free parallel rigid body simulation", 2012).
//
// Cada contato resolve sobre cópias dos corpos com massa m/nᵢ (nᵢ = contatos do corpo neste substep, contados na
// narrowphase); o impulso P de cada contato soma P·inv_mass em Δv do corpo (média das cópias) por atomics inteiros em
// ponto fixo; `rb_apply_body_delta_main` aplica e zera as somas. Uma iteração = contatos em paralelo + corpos em
// paralelo. Entradas:
//   rb_warm_apply_main         — warm start: impulsos do substep anterior (× warm_start_factor) por contato
//   rb_solve_contacts_main     — uma iteração Jacobi: normal (Signorini), rolamento e atrito (cone de Coulomb)
//   rb_apply_body_delta_main   — Δv/Δω acumulados → vel/omega de cada corpo
//   rb_warm_store_main         — grava os impulsos na região da tabela deste substep
@group(0) @binding(0) var<uniform>             rb_params:       RBSimParams;
@group(0) @binding(1) var<storage, read_write> bodies:          array<RigidBody>;
@group(0) @binding(2) var<storage, read_write> contacts:        array<RBContact>;
@group(0) @binding(3) var<storage, read>       b_vec:           array<f32>;
@group(0) @binding(4) var<storage, read>       contact_counter: array<u32>;
@group(0) @binding(5) var<storage, read_write> warm_table:      array<RBWarmEntry>;
@group(0) @binding(6) var<storage, read_write> body_delta:      array<RBBodyDelta>;
@group(0) @binding(7) var<storage, read>       body_split:      array<u32>;

fn contact_index(gid3: vec3u, nwg: vec3u) -> u32 {
    return gid3.x + gid3.y * nwg.x * 64u;
}

fn active_contacts() -> u32 {
    return min(contact_counter[0], rb_params.max_contacts);
}

// Corpo B dinâmico do contato (massa finita); 0xFFFFFFFFu se estático.
fn dynamic_b(ci: u32) -> u32 {
    let rb_j = contacts[ci].rb_idx_b;
    if (rb_j == 0xFFFFFFFFu || rb_j >= rb_params.body_count) { return 0xFFFFFFFFu; }
    if (bodies[rb_j].pos.w == 0.0) { return 0xFFFFFFFFu; }
    return rb_j;
}

// Fator de divisão de massa do corpo: contatos dele neste substep (≥ 1).
fn split_of(rb: u32) -> f32 {
    return f32(max(body_split[rb], 1u));
}

// Soma P·inv_mass (Δv) e (r × P)·I_inv (Δω) no corpo — sinal já aplicado pelo chamador.
fn add_body_delta(rb: u32, dv_raw: vec3f, dw_raw: vec3f) {
    let dv = clamp(dv_raw, vec3f(-RB_FIXED_LIMIT), vec3f(RB_FIXED_LIMIT));
    let dw = clamp(dw_raw, vec3f(-RB_FIXED_LIMIT), vec3f(RB_FIXED_LIMIT));
    atomicAdd(&body_delta[rb].dv_x, fixed_from_f32(dv.x, RB_FIXED_SCALE));
    atomicAdd(&body_delta[rb].dv_y, fixed_from_f32(dv.y, RB_FIXED_SCALE));
    atomicAdd(&body_delta[rb].dv_z, fixed_from_f32(dv.z, RB_FIXED_SCALE));
    atomicAdd(&body_delta[rb].dw_x, fixed_from_f32(dw.x, RB_FIXED_SCALE));
    atomicAdd(&body_delta[rb].dw_y, fixed_from_f32(dw.y, RB_FIXED_SCALE));
    atomicAdd(&body_delta[rb].dw_z, fixed_from_f32(dw.z, RB_FIXED_SCALE));
}

// Aplica um impulso linear P no ponto (r_a em A, r_b em B) e um impulso angular L puro (A recebe +, B recebe −).
fn add_contact_impulse(rb_i: u32, rb_j: u32, r_a: vec3f, r_b: vec3f, p: vec3f, l: vec3f) {
    let inv_a = bodies[rb_i].pos.w;
    let I_a   = bodies[rb_i].I_inv.xyz;
    add_body_delta(rb_i, p * inv_a, (cross(r_a, p) + l) * I_a);
    if (rb_j != 0xFFFFFFFFu) {
        let inv_b = bodies[rb_j].pos.w;
        let I_b   = bodies[rb_j].I_inv.xyz;
        add_body_delta(rb_j, -p * inv_b, -(cross(r_b, p) + l) * I_b);
    }
}

@compute @workgroup_size(64)
fn rb_warm_apply_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let ci = contact_index(gid3, nwg);
    if (ci >= active_contacts()) { return; }
    let rb_i = contacts[ci].rb_idx;
    if (bodies[rb_i].pos.w == 0.0) { return; }
    let wsf = rb_params.warm_start_factor;
    // Impulsos acumulados partem do warm start escalonado (o PGS projeta a partir deles).
    let lambda_n  = contacts[ci].point.w * wsf;
    let lambda_tx = contacts[ci].lambda_tx * wsf;
    let lambda_ty = contacts[ci].lambda_ty * wsf;
    contacts[ci].point.w   = lambda_n;
    contacts[ci].lambda_tx = lambda_tx;
    contacts[ci].lambda_ty = lambda_ty;
    if (wsf <= 0.0) { return; }
    let n  = contacts[ci].normal.xyz;
    let t1 = tangent_orthogonal(n);
    let t2 = cross(n, t1);
    let rb_j = dynamic_b(ci);
    let r_a = contacts[ci].point.xyz - bodies[rb_i].pos_pred.xyz;
    var r_b = vec3f(0.0);
    if (rb_j != 0xFFFFFFFFu) { r_b = contacts[ci].point.xyz - bodies[rb_j].pos_pred.xyz; }
    add_contact_impulse(rb_i, rb_j, r_a, r_b, n * lambda_n + t1 * lambda_tx + t2 * lambda_ty, vec3f(0.0));
}

@compute @workgroup_size(64)
fn rb_solve_contacts_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let ci = contact_index(gid3, nwg);
    if (ci >= active_contacts()) { return; }
    let rb_i = contacts[ci].rb_idx;
    let inv_a = bodies[rb_i].pos.w;
    if (inv_a == 0.0) { return; }

    // Cópia do corpo A com massa dividida (inv × nᵢ); idem B se dinâmico.
    let s_a   = split_of(rb_i);
    let m_a   = inv_a * s_a;
    let I_a   = bodies[rb_i].I_inv.xyz * s_a;
    var v_a   = bodies[rb_i].vel.xyz;
    var w_a   = bodies[rb_i].omega.xyz;
    let r_a   = contacts[ci].point.xyz - bodies[rb_i].pos_pred.xyz;

    let rb_j  = dynamic_b(ci);
    var m_b   = 0.0;
    var I_b   = vec3f(0.0);
    var v_b   = vec3f(0.0);
    var w_b   = vec3f(0.0);
    var r_b   = vec3f(0.0);
    if (rb_j != 0xFFFFFFFFu) {
        let s_b = split_of(rb_j);
        m_b = bodies[rb_j].pos.w * s_b;
        I_b = bodies[rb_j].I_inv.xyz * s_b;
        v_b = bodies[rb_j].vel.xyz;
        w_b = bodies[rb_j].omega.xyz;
        r_b = contacts[ci].point.xyz - bodies[rb_j].pos_pred.xyz;
    }
    let n = contacts[ci].normal.xyz;

    // Impulso total desta iteração (linear e angular puro), somado ao fim nos corpos reais.
    var p_total = vec3f(0.0);
    var l_total = vec3f(0.0);

    // ── Normal: passo PGS-LCP (projeção de Signorini) ────────────────────────────────────────────────
    let j_v = dot(contact_point_velocity(v_a, w_a, r_a) - contact_point_velocity(v_b, w_b, r_b), n);
    let pgs_n = lcp_pgs_step(j_v, b_vec[ci], contacts[ci].diagonal_n, contacts[ci].point.w);
    let lam_n = pgs_n.y;
    contacts[ci].point.w = lam_n;
    let p_n = n * pgs_n.x;
    v_a += p_n * m_a;
    w_a += cross(r_a, p_n) * I_a;
    v_b -= p_n * m_b;
    w_b -= cross(r_b, p_n) * I_b;
    p_total += p_n;

    // ── Resistência ao rolamento: impulso angular contra a rotação relativa fora da normal ─────────────
    // Limitado por c·λn (c = coeficiente de rolamento em metros, maior dos dois corpos).
    var c_roll = bodies[rb_i]._rb_pad.y;
    let rb_j_any = contacts[ci].rb_idx_b;
    if (rb_j_any != 0xFFFFFFFFu && rb_j_any < rb_params.body_count) {
        c_roll = max(c_roll, bodies[rb_j_any]._rb_pad.y);
    }
    if (c_roll > 0.0) {
        let w_rel  = w_a - w_b;
        let w_perp = w_rel - n * dot(w_rel, n);
        let old_l  = contacts[ci].rolling;
        var new_l  = old_l - w_perp / max(I_a + I_b, vec3f(1e-12));
        let max_l  = c_roll * lam_n;
        let len_l  = length(new_l);
        if (len_l > max_l) { new_l *= max_l / max(len_l, 1e-12); }
        let l = new_l - old_l;
        contacts[ci].rolling = new_l;
        w_a += l * I_a;
        w_b -= l * I_b;
        l_total += l;
    }

    // ── Atrito: passo PGS no cone de Coulomb ───────────────────────────────────────────────────────────
    let mu = bodies[rb_i].mat_props.y;
    if (mu > 0.0) {
        let t1 = tangent_orthogonal(n);
        let t2 = cross(n, t1);
        let v_rel = contact_point_velocity(v_a, w_a, r_a) - contact_point_velocity(v_b, w_b, r_b);
        let pgs_t = lcp_pgs_step_friction(
            vec2f(dot(v_rel, t1), dot(v_rel, t2)),
            vec2f(contacts[ci].diagonal_t1, contacts[ci].diagonal_t2),
            vec2f(contacts[ci].lambda_tx, contacts[ci].lambda_ty),
            lam_n,
            mu,
        );
        contacts[ci].lambda_tx = pgs_t.z;
        contacts[ci].lambda_ty = pgs_t.w;
        p_total += t1 * pgs_t.x + t2 * pgs_t.y;
    }

    add_contact_impulse(rb_i, rb_j, r_a, r_b, p_total, l_total);
}

@compute @workgroup_size(64)
fn rb_apply_body_delta_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = contact_index(gid3, nwg);
    if (i >= rb_params.body_count) { return; }
    let dv = vec3f(
        fixed_to_f32(atomicExchange(&body_delta[i].dv_x, 0), RB_FIXED_SCALE),
        fixed_to_f32(atomicExchange(&body_delta[i].dv_y, 0), RB_FIXED_SCALE),
        fixed_to_f32(atomicExchange(&body_delta[i].dv_z, 0), RB_FIXED_SCALE),
    );
    let dw = vec3f(
        fixed_to_f32(atomicExchange(&body_delta[i].dw_x, 0), RB_FIXED_SCALE),
        fixed_to_f32(atomicExchange(&body_delta[i].dw_y, 0), RB_FIXED_SCALE),
        fixed_to_f32(atomicExchange(&body_delta[i].dw_z, 0), RB_FIXED_SCALE),
    );
    if (bodies[i].pos.w == 0.0) { return; }
    bodies[i].vel   = vec4f(bodies[i].vel.xyz + dv,   bodies[i].vel.w);
    bodies[i].omega = vec4f(bodies[i].omega.xyz + dw, bodies[i].omega.w);
}

@compute @workgroup_size(64)
fn rb_warm_store_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let ci = contact_index(gid3, nwg);
    if (ci >= active_contacts()) { return; }
    let capacity = rb_params.warm_capacity;
    if (capacity == 0u) { return; }
    let region = rb_warm_region(rb_params.contact_stamp, capacity);
    let key  = rb_warm_key(contacts[ci].col_idx, contacts[ci].feature);
    let home = rb_warm_home(key, capacity);
    for (var p = 0u; p < RB_WARM_PROBES; p++) {
        let s = region + ((home + p) & (capacity - 1u));
        var r = atomicCompareExchangeWeak(&warm_table[s].key, 0u, key);
        // Falha espúria da versão fraca: repete enquanto o slot continua vazio.
        while (!r.exchanged && r.old_value == 0u) {
            r = atomicCompareExchangeWeak(&warm_table[s].key, 0u, key);
        }
        if (r.exchanged || r.old_value == key) {
            warm_table[s].lambda_n  = contacts[ci].point.w;
            warm_table[s].lambda_tx = contacts[ci].lambda_tx;
            warm_table[s].lambda_ty = contacts[ci].lambda_ty;
            return;
        }
    }
}
