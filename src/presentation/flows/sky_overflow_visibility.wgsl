// A fração visível do disco do sol (spec 041; ver `sky_overflow.wgsl`): um grupo de 64 invocações, cada uma num ponto de
// uma grade 8 × 8 sobre o quadrado do disco (os de dentro do círculo e da tela contam): o fundo (a profundidade no plano
// distante) × a transmitância das nuvens no pixel; a média acumulada pela série `Sky.sunVisibility` (a fatia anterior
// pelo atraso 1; sem ela, a de agora). Em x a acumulada, em y a de agora.
// Requer: sky_overflow_common, sky_disk_cover, sky_sun_visibility_prev, sky_sun_visibility_out.

/** Peso do quadro novo na fração visível acumulada (~8 quadros de memória). */
const SKY_OVERFLOW_VISIBILITY_BLEND: f32 = 0.125;

var<workgroup> sky_overflow_visible: array<vec2f, 64>;

@compute @workgroup_size(64)
fn sky_overflow_visibility_main(@builtin(local_invocation_index) li: u32) {
    let size = vec2f(sky_overflow_depth_size());
    let disk = sky_overflow_disk(size);
    var sample = vec2f(0.0);
    if (disk.z >= 0.0) {
        let g = (vec2f(f32(li % 8u), f32(li / 8u)) + 0.5) / 8.0 * 2.0 - 1.0;
        let q = disk.xy + g * disk.w;
        if (length(g) <= 1.0 && all(q >= vec2f(0.0)) && all(q < size)) {
            let px = vec2i(q);
            let open = select(0.0, 1.0, sky_overflow_depth(px) >= 1.0);
            sample = vec2f(open * sky_disk_cover(vec2u(px)).a, 1.0);
        }
    }
    sky_overflow_visible[li] = sample;
    workgroupBarrier();
    for (var stride = 32u; stride > 0u; stride >>= 1u) {
        if (li < stride) { sky_overflow_visible[li] += sky_overflow_visible[li + stride]; }
        workgroupBarrier();
    }
    if (li == 0u) {
        let total = sky_overflow_visible[0];
        let now = select(0.0, total.x / max(total.y, 1.0), total.y > 0.0);
        let prev = textureLoad(sky_sun_visibility_prev, vec2u(0u), 0);
        // A fatia anterior escrita (a = 1): acumula; sem ela (a série recém-criada), a de agora.
        let kept = select(now, mix(prev.x, now, SKY_OVERFLOW_VISIBILITY_BLEND), prev.a > 0.5);
        textureStore(sky_sun_visibility_out, vec2u(0u), vec4f(kept, now, 0.0, 1.0));
    }
}
