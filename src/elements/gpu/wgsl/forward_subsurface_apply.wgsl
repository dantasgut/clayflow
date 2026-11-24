// A luz difundida sob a superfície somada à cor da cena (spec 011, T113): as entidades com o lobo de subsuperfície
// desenhadas sobre a cor (a profundidade do passe principal, teste igual; mistura aditiva; com MSAA, nas amostras). Cada
// fragmento lê `subsurface_diffused` (o que `forward_subsurface_gather` juntou por pixel, com conjuntos de amostras que
// se repetem a cada 4 × 4 pixels) numa janela de 5 × 5 com meio peso nas bordas — cada um dos 16 conjuntos entra com o
// mesmo peso —, só dos pixels da mesma superfície (a distância à frente da câmera guardada no alfa, a menos da
// inclinação da superfície na janela). A média sai pela saída do fechamento no pixel (`subsurface_exit`), menos a luz do
// próprio ponto (`subsurface_local`: o que o passe principal já desenhou como o difuso do perfil integrado, sem média —
// a borda nítida de uma sombra some exata), com a névoa até o ponto. Na borda coberta em parte (o centro do pixel fora
// do objeto), a saída e a luz do ponto são as dos vizinhos que são a superfície.
// Requer: forward; scene_fog; subsurface_diffused, subsurface_local, subsurface_exit.

@fragment
fn fs_subsurface_apply(in: VsOut) -> ForwardOut {
    let cam = cameras[forward_frame.cameraSlot];
    let ahead = dot(in.world_position - cam.position.xyz, -normalize(cam.inverseView[2].xyz));
    // A superfície na janela: a variação da distância em dois pixels e a precisão do alfa de 16 bits.
    let tolerance = 3.0 * fwidth(ahead) + 2e-3 * ahead;
    let size = vec2i(textureDimensions(subsurface_diffused));
    let px = clamp(vec2i(in.clip_position.xy), vec2i(0), size - vec2i(1));
    let here = textureLoad(subsurface_local, px, 0);
    let stored = here.a > 0.0 && abs(here.a - ahead) <= tolerance;
    var sum = vec3f(0.0);
    var weight = 0.0;
    var local = vec3f(0.0);
    var exit = vec3f(0.0);
    for (var j = -2; j <= 2; j++) {
        for (var i = -2; i <= 2; i++) {
            let q = px + vec2i(i, j);
            if (any(q < vec2i(0)) || any(q >= size)) { continue; }
            let t = textureLoad(subsurface_diffused, q, 0);
            if (t.a <= 0.0 || abs(t.a - ahead) > tolerance) { continue; }
            let w = select(1.0, 0.5, abs(i) == 2) * select(1.0, 0.5, abs(j) == 2);
            sum += w * t.rgb;
            weight += w;
            if (!stored) {
                local += w * textureLoad(subsurface_local, q, 0).rgb;
                exit += w * textureLoad(subsurface_exit, q, 0).rgb;
            }
        }
    }
    var out: ForwardOut;
    out.color = vec4f(0.0);
    out.light = vec4f(0.0);
    if (weight > 0.0) {
        if (stored) {
            local = here.rgb;
            exit = textureLoad(subsurface_exit, px, 0).rgb;
        } else {
            local /= weight;
            exit /= weight;
        }
        out.color = vec4f((exit * (sum / weight) - local) * scene_fog(in.world_position).transmittance, 0.0);
    }
    return out;
}
