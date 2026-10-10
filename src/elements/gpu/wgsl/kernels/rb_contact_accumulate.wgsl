// Spec 004 (R19) — correção posicional por corpo a partir da lista compactada de contatos do último substep.
// Serial: soma, para cada corpo A do contato, a correção de penetração (acima da folga) e marca que há contato.
// `body_contact` é zerado (Frame.clear) antes deste passe; `rb_lcp_commit` o lê.
@group(0) @binding(0) var<uniform>             rb_params:       RBSimParams;
@group(0) @binding(1) var<storage, read>       contacts:        array<RBContact>;
@group(0) @binding(2) var<storage, read>       contact_counter: array<u32>;
@group(0) @binding(3) var<storage, read_write> body_contact:    array<vec4f>;

@compute @workgroup_size(1)
fn rb_contact_accumulate_main() {
    let contact_count = min(contact_counter[0], rb_params.max_contacts);
    let slop = rb_params.penetration_slop;
    for (var ci = 0u; ci < contact_count; ci++) {
        if (contacts[ci].is_active == 0u) { continue; }
        let i = contacts[ci].rb_idx;
        if (i >= rb_params.body_count) { continue; }
        var acc = body_contact[i];
        acc.w = 1.0;
        let actual_d = contacts[ci]._pad3; // SDF real (sem especulativo); negativo = penetração
        if (actual_d < -slop) {
            let corr_depth = -(actual_d + slop);
            acc = vec4f(acc.xyz + contacts[ci].normal.xyz * corr_depth * 0.1, acc.w);
        }
        body_contact[i] = acc;
    }
}
