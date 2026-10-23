// Traçado da refração (spec 034, R1, T044): uma invocação por pixel da fila (despacho indireto pela contagem, que o
// estado do quadro também guarda: as invocações além dela não fazem nada), uma amostra (`refraction_sample`) do raio
// da câmera do pixel, com o mesmo deslocamento da amostra do quadro e o estado aleatório do pixel e do quadro
// (`refraction_seed`). A radiância (a transmitida mais a refletida na primeira interface) vai para
// `refraction_radiance_out` (no alfa, a luminância da energia truncada no limite de interfaces: o smoke soma a fração);
// o ponto em que termina o caminho que mais contribui para a cor, com o registro do objeto, para `refraction_hit_out`
// (quem calcula o movimento do que o pixel mostra o lê; o traçado não sabe de movimento).
// Requer: WORKGROUP_SIZE, REFRACTION_FRAME_COUNT, refraction, refraction_path, refraction_queue_in, refraction_frame,
// refraction_radiance_out, refraction_hit_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_trace_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(refraction_queue_in);
    let q = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (q >= textureLoad(refraction_frame, vec2u(REFRACTION_FRAME_COUNT, 0u), 0).x) { return; }
    let pixel = textureLoad(refraction_queue_in, vec2u(q % size.x, q / size.x), 0).x;
    let px = vec2u(pixel % size.x, pixel / size.x);
    var state = refraction_seed(pixel, refraction.frame);
    let ray = ray_camera(refraction.camera_slot, vec2f(px) + 0.5, vec2f(size));
    let s = refraction_sample(ray, refraction_camera_stack(), &state);
    textureStore(refraction_radiance_out, px, vec4f(s.radiance, s.truncated));
    textureStore(refraction_hit_out, px, s.end);
}
