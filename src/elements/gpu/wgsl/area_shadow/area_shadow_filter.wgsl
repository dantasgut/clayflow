// O filtro espacial da sombra das luzes de área (à-trous 5 × 5, guiado pelo ponto de mundo e pela própria fração, como
// no SVGF): `as_atrous` de uma origem com o passo dado. Só entram os vizinhos da mesma superfície (a distância ao ponto
// do centro, pelo tamanho do texel no mundo) e de fração parecida — a folga é o desvio esperado da média (a fração
// v de n quadros de um raio: √(v (1 − v) / n)): onde a média já é 0 ou 1 (fora da penumbra) nada é borrado, e a borda
// nítida de uma sombra de contato fica.
// Requer: as_point, as_history_now (leitura).

fn as_atrous(source: texture_2d<f32>, q: vec2i, stride: i32) -> vec4f {
    let dim = vec2i(textureDimensions(source));
    let centre = textureLoad(source, q, 0);
    let point = textureLoad(as_point, q, 0);
    if (point.w <= 0.0) { return centre; }
    // O tamanho do texel no mundo: a menor distância aos vizinhos diretos que valem.
    var texel = 3.0e38;
    for (var k = 0u; k < 4u; k++) {
        let o = vec2i(i32(k & 1u) * 2 - 1, 0) * i32(k < 2u) + vec2i(0, i32(k & 1u) * 2 - 1) * i32(k >= 2u);
        let t = clamp(q + o, vec2i(0), dim - 1);
        let tp = textureLoad(as_point, t, 0);
        if (tp.w > 0.0 && any(t != q)) { texel = min(texel, distance(tp.xyz, point.xyz)); }
    }
    if (texel > 1.0e38) { return centre; }
    let frames = max(textureLoad(as_history_now, q, 0).w, 1.0);
    let sigma = 3.0 * sqrt(max(centre * (vec4f(1.0) - centre), vec4f(0.0)) / frames) + vec4f(0.02);
    let kernel = array<f32, 3>(0.375, 0.25, 0.0625);
    var sum = vec4f(0.0);
    var weight = vec4f(0.0);
    for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
            let t = q + vec2i(dx, dy) * stride;
            if (any(t < vec2i(0)) || any(t >= dim)) { continue; }
            let tp = textureLoad(as_point, t, 0);
            if (tp.w <= 0.0) { continue; }
            let reach = length(vec2f(f32(dx), f32(dy))) * f32(stride) * texel;
            if (distance(tp.xyz, point.xyz) > 3.0 * reach + 0.5 * texel) { continue; }
            let v = textureLoad(source, t, 0);
            let w = kernel[u32(abs(dx))] * kernel[u32(abs(dy))] * exp(-abs(v - centre) / sigma);
            sum += w * v;
            weight += w;
        }
    }
    return sum / max(weight, vec4f(1.0e-9));
}
