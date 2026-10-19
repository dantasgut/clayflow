// Fim do quadro da refração traçada (spec 034, US7), depois do traçado por pixel (`gi_refraction.wgsl`):
//   - `gi_refraction_args_main`: os caminhos na fila de continuação → os argumentos do despacho indireto dela (a
//     contagem limitada à capacidade da fila vai também para o histórico, onde a continuação a lê);
//   - `gi_refraction_resolve_main`: a amostra do quadro de cada pixel (com a continuação somada) na média temporal
//     reprojetada pelo primeiro acerto — a rugosidade, as escolhas de Fresnel e a área do pixel (o antisserrilhado)
//     convergem, sem desfoque; a saída `gi_refraction_out` (rgb, a = 1 onde o primeiro acerto é transmissivo);
//   - `gi_refraction_finish_main`: a vista-projeção da câmera ativa no cabeçalho do histórico (a reprojeção do quadro
//     seguinte) e a fila zerada.
// Requer: WORKGROUP_SIZE, gi, cameras, gi_refraction_common, gi_refraction_history, gi_refraction_count,
// gi_refraction_queue, gi_refraction_out.

/** Quadros no máximo da média temporal (parado, a imagem converge até eles). */
const GI_REFRACTION_HISTORY: f32 = 64.0;

@compute @workgroup_size(1)
fn gi_refraction_args_main() {
    let queued = min(atomicLoad(&gi_refraction_count[3]), arrayLength(&gi_refraction_queue) / 4u);
    atomicStore(&gi_refraction_count[0], (queued + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE);
    atomicStore(&gi_refraction_count[1], 1u);
    atomicStore(&gi_refraction_count[2], 1u);
    gi_refraction_history[gi_refraction_queued_at()] = vec4f(bitcast<f32>(queued), 0.0, 0.0, 0.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_refraction_resolve_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= gi_refraction_pixels()) { return; }
    let width = u32(gi.screenSize.x);
    let pixel = vec2u(i % width, i / width);
    let out_at = gi_refraction_at(gi.screen1.y, i);
    let sample = gi_refraction_history[gi_refraction_sample_at(i, 0u)];
    if (sample.w == 0.0) {
        gi_refraction_history[out_at] = vec4f(0.0);
        textureStore(gi_refraction_out, pixel, vec4f(0.0));
        return;
    }
    let first = gi_refraction_history[gi_refraction_sample_at(i, 1u)];
    let position = first.xyz;
    let cam = cameras[gi.screen.w].position.xyz;
    // A média temporal: o pixel do quadro anterior pela projeção do primeiro acerto; o histórico vale se lá havia o
    // mesmo acerto (a distância ao longo do raio a 1 %).
    var count = 1.0;
    var radiance = sample.rgb;
    let vp = mat4x4f(gi_refraction_history[0], gi_refraction_history[1], gi_refraction_history[2], gi_refraction_history[3]);
    let clip = vp * vec4f(position, 1.0);
    if (clip.w > 0.0) {
        let ndc = clip.xy / clip.w;
        let prev = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * gi.screenSize.xy;
        if (all(prev >= vec2f(0.0)) && all(prev < gi.screenSize.xy)) {
            let q = vec2u(prev);
            let h = gi_refraction_history[gi_refraction_at(1u - gi.screen1.y, q.x + q.y * width)];
            let ok = h.w > 0.0 && abs(h.z - distance(cam, position)) <= 0.01 * h.z + 1e-3;
            if (ok) {
                count = min(h.w + 1.0, GI_REFRACTION_HISTORY);
                let old = vec3f(unpack2x16float(bitcast<u32>(h.x)), unpack2x16float(bitcast<u32>(h.y)).x);
                radiance = mix(old, sample.rgb, 1.0 / count);
            }
        }
    }
    let packed = vec2f(bitcast<f32>(pack2x16float(radiance.rg)), bitcast<f32>(pack2x16float(vec2f(radiance.b, 0.0))));
    gi_refraction_history[out_at] = vec4f(packed, distance(cam, position), count);
    textureStore(gi_refraction_out, pixel, vec4f(radiance, 1.0));
}

@compute @workgroup_size(1)
fn gi_refraction_finish_main() {
    let cam = cameras[gi.screen.w];
    for (var c = 0u; c < 4u; c++) { gi_refraction_history[c] = cam.viewProjection[c]; }
    atomicStore(&gi_refraction_count[3], 0u);
}
