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

// Nós de cor (spec 011): de componentes, de HSV, de temperatura de cor e a luminância (Rec. 709, linear).

fn node_color_rgb(r: f32, g: f32, b: f32) -> vec3f {
    return vec3f(r, g, b);
}

// HSV → RGB linear (matiz em voltas [0, 1)).
fn node_color_hsv(h: f32, s: f32, v: f32) -> vec3f {
    let k = vec3f(1.0, 2.0 / 3.0, 1.0 / 3.0);
    let p = abs(fract(vec3f(h) + k) * 6.0 - 3.0);
    return v * mix(vec3f(1.0), clamp(p - 1.0, vec3f(0.0), vec3f(1.0)), clamp(s, 0.0, 1.0));
}

// Temperatura de cor (K, 1000–40000) → RGB linear normalizado no máximo 1 (ajuste de Tanner Helland, em sRGB,
// convertido para linear).
fn node_color_temperature(kelvin: f32) -> vec3f {
    let t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
    var c: vec3f;
    if (t <= 66.0) {
        c.r = 1.0;
        c.g = clamp((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0);
        c.b = select(clamp((138.5177312231 * log(t - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0), 0.0, t <= 19.0);
    } else {
        c.r = clamp(329.698727446 * pow(t - 60.0, -0.1332047592) / 255.0, 0.0, 1.0);
        c.g = clamp(288.1221695283 * pow(t - 60.0, -0.0755148492) / 255.0, 0.0, 1.0);
        c.b = 1.0;
    }
    let lin = select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
    return lin / max(lin.r, max(lin.g, lin.b));
}

fn node_color_luminance(c: vec3f) -> f32 {
    return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}
