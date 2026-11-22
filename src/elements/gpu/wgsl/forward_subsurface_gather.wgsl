// Difusão da luz sob a superfície (spec 011, T113): as entidades com o lobo de subsuperfície desenhadas de novo, sem
// amostras, no alvo `diffused`. Cada fragmento junta a luz guardada em `subsurface_irradiance` em volta do seu ponto
// pelo perfil de difusão de Burley do seu fechamento: `SUBSURFACE_SAMPLES` amostras (número constante) num disco no
// plano tangente, o raio sorteado pela importância do perfil do canal que vai mais longe (a inversa exata da fração
// acumulada, uma amostra por faixa igual de energia) e o ângulo pela sequência áurea; cada uma projetada na tela (o
// raio em mm vira pixels pela escala do mundo e pela profundidade), pesada por canal pelo perfil na distância de verdade
// até a superfície que o pixel dela mostra (a profundidade guardada: o que está longe em profundidade, de outro objeto
// ou de outra dobra, pesa pelo perfil — quase nada) e normalizada. O disco gira e os raios se deslocam dentro das faixas
// num padrão que se repete a cada 4 × 4 pixels (amostragem intercalada, Keller e Heidrich 2001): os 16 pixels de um
// bloco juntam 16 conjuntos diferentes, e o passe que soma à cor (`forward_subsurface_apply`) faz a média deles. Sai a
// luz juntada e, no alfa, a distância do ponto à frente da câmera. Só o fragmento que é a superfície guardada no pixel
// é sombreado (a profundidade própria da subsuperfície, só de leitura no passe, teste igual).
// Requer: forward; subsurface; basis; constants; camera_space; view_space; subsurface_irradiance, subsurface_depth.

// Amostras do perfil por fragmento (a constante do pipeline; o teto do laço é `SUBSURFACE_MAX_SAMPLES`).
override SUBSURFACE_SAMPLES: u32 = 16u;
const SUBSURFACE_MAX_SAMPLES: u32 = 64u;
// O ângulo áureo (rad): amostras sucessivas espalhadas em volta do disco.
const SUBSURFACE_GOLDEN_ANGLE: f32 = 2.39996323;
// A ordem de Bayer 4 × 4 (linha a linha): vizinhos com conjuntos de amostras o mais diferentes possível.
const SUBSURFACE_BAYER = array<u32, 16>(0u, 8u, 2u, 10u, 12u, 4u, 14u, 6u, 3u, 11u, 1u, 9u, 15u, 7u, 13u, 5u);

// O ponto de mundo que o pixel de profundidade `z` mostra ao longo do raio da câmera pelo ponto `ndc` da tela.
fn subsurface_point(ndc: vec2f, z: f32) -> vec3f {
    let cam = cameras[forward_frame.cameraSlot];
    let ray = camera_ray_ndc(forward_frame.cameraSlot, ndc);
    let ahead = view_depth(z, cam.projection);
    return ray.origin + ray.dir * (ahead / max(dot(ray.dir, -normalize(cam.inverseView[2].xyz)), 1e-6));
}

@fragment
fn fs_subsurface_gather(in: VsOut, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {
    let surface = forward_surface(in, front);
    let c = surface.c;
    let n = surface.n;
    let p = in.world_position;
    let cam = cameras[forward_frame.cameraSlot];
    let size = vec2i(textureDimensions(subsurface_irradiance));
    let px = clamp(vec2i(in.clip_position.xy), vec2i(0), size - vec2i(1));
    let center = textureLoad(subsurface_irradiance, px, 0);
    let ahead = dot(p - cam.position.xyz, -normalize(cam.inverseView[2].xyz));
    let d = subsurface_length(c);
    let reach = max(d.x, max(d.y, d.z));
    var sum = vec3f(0.0);
    var weight = vec3f(0.0);
    if (reach > 0.0) {
        let tangent = basis_duff(n);
        let cell = SUBSURFACE_BAYER[u32(px.x & 3) + 4u * u32(px.y & 3)];
        let turn = TAU * (f32(cell) + 0.5) / 16.0;
        let shift = (f32((cell * 7u + 5u) & 15u) + 0.5) / 16.0;
        let count = min(SUBSURFACE_SAMPLES, SUBSURFACE_MAX_SAMPLES);
        for (var i = 0u; i < SUBSURFACE_MAX_SAMPLES; i++) {
            if (i >= count) { break; }
            let r = subsurface_sample((f32(i) + shift) / f32(count), reach);
            let a = turn + f32(i) * SUBSURFACE_GOLDEN_ANGLE;
            let q = p + (tangent[0] * cos(a) + tangent[1] * sin(a)) * r;
            let clip = cam.viewProjection * vec4f(q, 1.0);
            if (clip.w <= 0.0) { continue; }
            let ndc = clip.xy / clip.w;
            let uv = ndc_to_uv(ndc);
            if (any(uv < vec2f(0.0)) || any(uv >= vec2f(1.0))) { continue; }
            let tap = vec2i(uv * vec2f(size));
            let e = textureLoad(subsurface_irradiance, tap, 0);
            if (e.a <= 0.0) { continue; }
            let y = subsurface_point(ndc, textureLoad(subsurface_depth, tap, 0));
            let distance = max(length(y - p), 1e-9);
            // O perfil de cada canal na distância de verdade sobre a densidade com que a amostra foi sorteada (por
            // área: a radial sobre 2π r).
            let w = subsurface_radial_pdf3(distance, d) * (r / (distance * subsurface_radial_pdf(r, reach)));
            sum += w * e.rgb;
            weight += w;
        }
    }
    let gathered = select(center.rgb, sum / max(weight, vec3f(1e-20)), weight > vec3f(0.0));
    return vec4f(gathered, ahead);
}
