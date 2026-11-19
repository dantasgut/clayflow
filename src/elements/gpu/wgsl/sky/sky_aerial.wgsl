// Tabela da perspectiva aérea (spec 041, R10; Hillaire 2020, §5.4): 32 × 32 colunas pela tela da câmera ativa (a direção
// do centro de cada coluna, sem o deslocamento da amostra) e 32 fatias de distância em distribuição quadrática até
// `SKY_AERIAL_RANGE` km (a fatia k vai até `D·((k + 1)/32)²`: finas perto, para as cenas de metros): a luz espalhada da
// câmera até o fim da fatia (rgb, por unidade de iluminância do sol: simples de Rayleigh e Mie com a transmitância do sol
// mais o múltiplo Ψms) e a transmitância (rgb). `SKY_AERIAL_SUBSTEPS` subpassos por fatia (teto constante).
//
// A luz simples é a do sol que chega ao ponto do ar (spec 041, raios crepusculares): × a visibilidade do sol ali
// (`sky_aerial_visibility`: o que tapa o sol além da própria atmosfera — a sombra das nuvens pelo mapa visto do sol, pelo
// ponto `light_transmission`). O ar na sombra de uma nuvem não espalha a luz do sol, o ar entre duas nuvens sim: os
// feixes de luz e de sombra (crepusculares, e anticrepusculares olhando para o lado oposto). O múltiplo (Ψms, a luz do
// céu) fica: a sombra de uma nuvem tira o sol, não o céu (como a Unreal, que sombreia só a parte simples).
//
// O fundo (o céu, que a vista do céu integra sem sombra) recebe o déficit da sombra (`sky_aerial_shadow_out`, por coluna):
// a luz simples que o ar sombreado deixa de espalhar no caminho até o fim da atmosfera (a tabela até `SKY_AERIAL_RANGE`
// e o resto até `SKY_AERIAL_SHADOW_RANGE`, onde termina o mapa visto do sol, em 32 trechos iguais), atenuada até a
// câmera. Quem desenha o fundo o subtrai da radiância do céu.
//
// Um grupo de 32 invocações por coluna, uma por fatia: cada uma integra a sua fatia (a luz que ela espalha, o déficit e a
// transmitância) e um trecho do resto; a varredura do grupo (Hillis–Steele, 5 rodadas) compõe as fatias da câmera até
// cada uma — `L = La + Ta·Lb`, `T = Ta·Tb` —, e a primeira invocação soma o resto ao déficit (32 parcelas).
// Despacho linear: `SKY_AERIAL_SLICES` invocações por coluna, grupos de `SKY_AERIAL_SLICES`.
// Requer: SKY_AERIAL_RANGE, view_space, sky_atmosphere, sky_lookup, sky, cameras, sky_aerial_visibility, sky_aerial_out,
// sky_aerial_transmittance_out, sky_aerial_shadow_out.

const SKY_AERIAL_SLICES: u32 = 32u;
const SKY_AERIAL_SUBSTEPS: u32 = 4u;
/** Até onde (km) o déficit do fundo segue além da tabela: o mapa visto do sol cobre ±200 km em volta da câmera. */
const SKY_AERIAL_SHADOW_RANGE: f32 = 150.0;

var<workgroup> sky_aerial_lum: array<vec3f, SKY_AERIAL_SLICES>;
var<workgroup> sky_aerial_def: array<vec3f, SKY_AERIAL_SLICES>;
var<workgroup> sky_aerial_tr: array<vec3f, SKY_AERIAL_SLICES>;
var<workgroup> sky_aerial_rest_def: array<vec3f, SKY_AERIAL_SLICES>;
var<workgroup> sky_aerial_rest_tr: array<vec3f, SKY_AERIAL_SLICES>;

/** Um trecho do raio: a luz espalhada (com a sombra), o déficit da sombra e a transmitância. */
struct SkyAerialSpan {
    lum: vec3f,
    deficit: vec3f,
    transmittance: vec3f,
}

/** O raio da coluna: a origem e a direção no sistema do planeta (o sol no plano x-y) e no mundo (metros). */
struct SkyAerialRay {
    pos: vec3f,
    dir: vec3f,
    sun: vec3f,
    origin: vec3f,
    world: vec3f,
    seg: f32,
    pr: f32,
    pm: f32,
}

/**
 * O trecho [`t0`, `t1`] km em `SKY_AERIAL_SUBSTEPS` subpassos (pelo meio de cada um), cortado no fim da atmosfera (o topo
 * ou o chão do planeta: o subpasso que o cruza vai só até ele).
 */
fn sky_aerial_span(ray: SkyAerialRay, t0: f32, t1: f32) -> SkyAerialSpan {
    let step = (t1 - t0) / f32(SKY_AERIAL_SUBSTEPS);
    var throughput = vec3f(1.0);
    var lum = vec3f(0.0);
    var deficit = vec3f(0.0);
    for (var j = 0u; j < SKY_AERIAL_SUBSTEPS; j++) {
        let a = t0 + f32(j) * step;
        let dt = max(min(a + step, ray.seg) - a, 0.0);
        if (dt <= 0.0) { break; }
        let mid = a + 0.5 * dt;
        let x = ray.pos + ray.dir * mid;
        let rx = length(x);
        let m = sky_medium(rx - sky_bottom());
        let step_t = exp(-m.extinction * dt);
        let integ = select(vec3f(dt), (1.0 - step_t) / max(m.extinction, vec3f(1e-12)), m.extinction > vec3f(0.0));
        let mu_s = dot(x, ray.sun) / rx;
        let free = (m.rayleigh * ray.pr + vec3f(m.mie * ray.pm)) * sky_transmittance(rx, mu_s);
        let single = free * sky_aerial_visibility(ray.origin + ray.world * (mid * 1000.0));
        let multi = m.scattering * sky_multiscatter(rx, mu_s);
        lum += throughput * (single + multi) * integ;
        deficit += throughput * (free - single) * integ;
        throughput *= step_t;
    }
    return SkyAerialSpan(lum, deficit, throughput);
}

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
    let ray = SkyAerialRay(
        vec3f(0.0, r0, 0.0),
        dir,
        sun,
        cam.position.xyz,
        view,
        sky_segment(r0, view.y),
        sky_rayleigh_phase(c),
        sky_mie_phase(c),
    );
    // A fatia k: de D·(k/32)² a D·((k + 1)/32)².
    let s0 = f32(k) / f32(SKY_AERIAL_SLICES);
    let s1 = f32(k + 1u) / f32(SKY_AERIAL_SLICES);
    let slice = sky_aerial_span(ray, SKY_AERIAL_RANGE * s0 * s0, SKY_AERIAL_RANGE * s1 * s1);
    sky_aerial_lum[k] = slice.lum;
    sky_aerial_def[k] = slice.deficit;
    sky_aerial_tr[k] = slice.transmittance;
    // O resto do déficit do fundo: de `SKY_AERIAL_RANGE` ao fim da atmosfera (ou do mapa), o trecho k de 32 iguais.
    let end = max(min(ray.seg, SKY_AERIAL_SHADOW_RANGE), SKY_AERIAL_RANGE);
    let step = (end - SKY_AERIAL_RANGE) / f32(SKY_AERIAL_SLICES);
    // Sem nada que tape o sol no ar (`sky_aerial_shadowed`), o déficit é zero: o resto não é integrado.
    var rest = SkyAerialSpan(vec3f(0.0), vec3f(0.0), vec3f(1.0));
    if (sky_aerial_shadowed()) {
        rest = sky_aerial_span(ray, SKY_AERIAL_RANGE + f32(k) * step, SKY_AERIAL_RANGE + f32(k + 1u) * step);
    }
    sky_aerial_rest_def[k] = rest.deficit;
    sky_aerial_rest_tr[k] = rest.transmittance;
    workgroupBarrier();
    // A varredura inclusiva: depois da rodada de passo `w`, a posição k compõe as fatias k − 2w + 1 … k.
    for (var w = 1u; w < SKY_AERIAL_SLICES; w <<= 1u) {
        var l = sky_aerial_lum[k];
        var d = sky_aerial_def[k];
        var t = sky_aerial_tr[k];
        if (k >= w) {
            l = sky_aerial_lum[k - w] + sky_aerial_tr[k - w] * l;
            d = sky_aerial_def[k - w] + sky_aerial_tr[k - w] * d;
            t = sky_aerial_tr[k - w] * t;
        }
        workgroupBarrier();
        sky_aerial_lum[k] = l;
        sky_aerial_def[k] = d;
        sky_aerial_tr[k] = t;
        workgroupBarrier();
    }
    if (valid) {
        textureStore(sky_aerial_out, vec3u(g, k), vec4f(sky_aerial_lum[k], 1.0));
        textureStore(sky_aerial_transmittance_out, vec3u(g, k), vec4f(sky_aerial_tr[k], 1.0));
        if (k == 0u) {
            let last = SKY_AERIAL_SLICES - 1u;
            var deficit = sky_aerial_def[last];
            var throughput = sky_aerial_tr[last];
            for (var j = 0u; j < SKY_AERIAL_SLICES; j++) {
                deficit += throughput * sky_aerial_rest_def[j];
                throughput *= sky_aerial_rest_tr[j];
            }
            textureStore(sky_aerial_shadow_out, g, vec4f(deficit, 1.0));
        }
    }
}
