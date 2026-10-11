// Spec 004 (R19) — correção posicional por corpo a partir da lista compactada de contatos do último substep.
// Paralelo por contato: soma no corpo A a correção de penetração (acima da folga) ponderada pelo peso do contato
// (1 / contatos do mesmo par — o manifold de cantos de uma caixa corrige uma vez por par) e conta o contato, em
// ponto fixo (atomics inteiros). `body_correction` é zerado (Frame.clear) antes deste passe; `rb_lcp_commit` o lê.
@group(0) @binding(0) var<uniform>             rb_params:       RBSimParams;
@group(0) @binding(1) var<storage, read>       contacts:        array<RBContact>;
@group(0) @binding(2) var<storage, read>       contact_counter: array<u32>;
@group(0) @binding(3) var<storage, read_write> body_correction: array<RBBodyCorrection>;

@compute @workgroup_size(64)
fn rb_contact_accumulate_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let ci = gid3.x + gid3.y * nwg.x * 64u;
    if (ci >= min(contact_counter[0], rb_params.max_contacts)) { return; }
    let i = contacts[ci].rb_idx;
    if (i >= rb_params.body_count) { return; }
    atomicAdd(&body_correction[i].contacts, 1);
    let actual_d = contacts[ci]._pad3; // SDF real (sem especulativo); negativo = penetração
    let slop = rb_params.penetration_slop;
    if (actual_d >= -slop) { return; }
    let c = contacts[ci].normal.xyz * (-(actual_d + slop) * 0.1 * contacts[ci].weight);
    atomicAdd(&body_correction[i].c_x, rb_to_fixed(c.x));
    atomicAdd(&body_correction[i].c_y, rb_to_fixed(c.y));
    atomicAdd(&body_correction[i].c_z, rb_to_fixed(c.z));
}
