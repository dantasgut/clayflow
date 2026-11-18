// Tabela da perspectiva aérea (spec 041, R10; Hillaire 2020, §5.4): 32 × 32 colunas pela tela da câmera ativa (a direção
// do centro de cada coluna, sem o deslocamento da amostra) e 32 fatias de distância em distribuição quadrática até
// `SKY_AERIAL_RANGE` km (a fatia k vai até `D·((k + 1)/32)²`: finas perto, para as cenas de metros): a luz espalhada da
// câmera até o fim da fatia (rgb, por unidade de iluminância do sol: simples de Rayleigh e Mie com a transmitância do sol
// mais o múltiplo Ψms) e a transmitância (rgb). Dois subpassos por fatia (teto constante).
// Um grupo de 32 invocações por coluna, uma por fatia: cada uma integra a sua fatia (a luz que ela espalha e a
// transmitância dela) e a varredura do grupo (Hillis–Steele, 5 rodadas) compõe as fatias da câmera até cada uma —
// `L = La + Ta·Lb`, `T = Ta·Tb` —, a mesma integral da marcha em série de 64 passos, com a latência de 2 passos (a
// coluna em série levava 0,11 ms no M4 para 32 × 32 colunas).
// Despacho linear: `SKY_AERIAL_SLICES` invocações por coluna, grupos de `SKY_AERIAL_SLICES`.
// Requer: SKY_AERIAL_RANGE, view_space, sky_atmosphere, sky_lookup, sky, cameras, sky_aerial_out, sky_aerial_transmittance_out.

const SKY_AERIAL_SLICES: u32 = 32u;
const SKY_AERIAL_SUBSTEPS: u32 = 2u;

var<workgroup> sky_aerial_lum: array<vec3f, SKY_AERIAL_SLICES>;
var<workgroup> sky_aerial_tr: array<vec3f, SKY_AERIAL_SLICES>;

@compute @workgroup_size(SKY_AERIAL_SLICES)
fn sky_aerial_main(
    @builtin(local_invocation_index) k: u32,
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let size = textureDimensions(sky_aerial_out);
    let column = wid.x + wid.y * nwg.x;
    // Sem retorno antes das barreiras: a coluna fora da tabela integra e não grava.
    let valid = column < size.x * size.y;
    let g = vec2u(column % size.x, min(column / size.x, size.y - 1u));
    let cam = cameras[sky.cameraSlot];
    let uv = (vec2f(g) + 0.5) / vec2f(size.xy);
    let ndc = uv_to_ndc(uv);
    let far = cam.inverseUnjitteredViewProjection * vec4f(ndc, 1.0, 1.0);
    let near = cam.inverseUnjitteredViewProjection * vec4f(ndc, 0.0, 1.0);
    let view = normalize(far.xyz / far.w - near.xyz / near.w);
    let r0 = sky_bottom() + max(sky.radii.w + cam.position.y * 0.001, 0.001);
    let pos = vec3f(0.0, r0, 0.0);
    let seg = sky_segment(r0, view.y);
    let sun_cos = clamp(sky.sunDirection.y, -1.0, 1.0);
    // O sol no plano x-y, a vista girada com o mesmo azimute relativo (como na vista do céu).
    let sun = vec3f(sqrt(max(0.0, 1.0 - sun_cos * sun_cos)), sun_cos, 0.0);
    let a = view.xz;
    let b = sky.sunDirection.xz;
    let cos_az = select(1.0, dot(a, b) / (length(a) * length(b)), length(a) > 1e-6 && length(b) > 1e-6);
    let sin_az = sqrt(max(0.0, 1.0 - cos_az * cos_az));
    let h = length(a);
    let dir = vec3f(h * cos_az, view.y, h * sin_az);
    let c = dot(dir, sun);
    let pr = sky_rayleigh_phase(c);
    let pm = sky_mie_phase(c);
    // A fatia k: de D·(k/32)² a D·((k + 1)/32)².
    let s0 = f32(k) / f32(SKY_AERIAL_SLICES);
    let s1 = f32(k + 1u) / f32(SKY_AERIAL_SLICES);
    let t0 = SKY_AERIAL_RANGE * s0 * s0;
    let dt = (SKY_AERIAL_RANGE * s1 * s1 - t0) / f32(SKY_AERIAL_SUBSTEPS);
    var throughput = vec3f(1.0);
    var lum = vec3f(0.0);
    for (var j = 0u; j < SKY_AERIAL_SUBSTEPS; j++) {
        let mid = t0 + (f32(j) + 0.5) * dt;
        let inside = mid < seg;
        let x = pos + dir * mid;
        let rx = length(x);
        let m = sky_medium(rx - sky_bottom());
        let step_t = select(vec3f(1.0), exp(-m.extinction * dt), inside);
        let integ = select(vec3f(dt), (1.0 - step_t) / max(m.extinction, vec3f(1e-12)), m.extinction > vec3f(0.0));
        let mu_s = dot(x, sun) / rx;
        let single = (m.rayleigh * pr + vec3f(m.mie * pm)) * sky_transmittance(rx, mu_s);
        let multi = m.scattering * sky_multiscatter(rx, mu_s);
        if (inside) { lum += throughput * (single + multi) * integ; }
        throughput *= step_t;
    }
    sky_aerial_lum[k] = lum;
    sky_aerial_tr[k] = throughput;
    workgroupBarrier();
    // A varredura inclusiva: depois da rodada de passo `w`, a posição k compõe as fatias k − 2w + 1 … k.
    for (var w = 1u; w < SKY_AERIAL_SLICES; w <<= 1u) {
        var l = sky_aerial_lum[k];
        var t = sky_aerial_tr[k];
        if (k >= w) {
            l = sky_aerial_lum[k - w] + sky_aerial_tr[k - w] * l;
            t = sky_aerial_tr[k - w] * t;
        }
        workgroupBarrier();
        sky_aerial_lum[k] = l;
        sky_aerial_tr[k] = t;
        workgroupBarrier();
    }
    if (valid) {
        textureStore(sky_aerial_out, vec3u(g, k), vec4f(sky_aerial_lum[k], 1.0));
        textureStore(sky_aerial_transmittance_out, vec3u(g, k), vec4f(sky_aerial_tr[k], 1.0));
    }
}
