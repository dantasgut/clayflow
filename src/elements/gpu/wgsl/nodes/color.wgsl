// Nós de rampa de cor (spec 031, R12): de dois pontos (`color_a` em `low`, `color_b` em `high`) e de quatro paradas
// (`stopK.rgb` na posição `stopK.w`, posições crescentes); lineares por trecho, presas nos extremos.
// Requer: nada.

fn node_color_ramp(t: f32, color_a: vec3f, color_b: vec3f, low: f32, high: f32) -> vec3f {
    let span = select(high - low, 1e-6, abs(high - low) < 1e-6);
    return mix(color_a, color_b, clamp((t - low) / span, 0.0, 1.0));
}

fn node_color_ramp4(t: f32, stop0: vec4f, stop1: vec4f, stop2: vec4f, stop3: vec4f) -> vec3f {
    if (t <= stop0.w) { return stop0.rgb; }
    if (t <= stop1.w) { return node_color_ramp(t, stop0.rgb, stop1.rgb, stop0.w, stop1.w); }
    if (t <= stop2.w) { return node_color_ramp(t, stop1.rgb, stop2.rgb, stop1.w, stop2.w); }
    if (t <= stop3.w) { return node_color_ramp(t, stop2.rgb, stop3.rgb, stop2.w, stop3.w); }
    return stop3.rgb;
}
