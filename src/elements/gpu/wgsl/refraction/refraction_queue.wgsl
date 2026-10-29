// Fila da refração (spec 034, R1): uma invocação por pixel; os pixels com pedido entram na fila compacta (o texel k
// guarda o índice linear do k-ésimo, na largura do canvas linha a linha) pela contagem atômica — o traçado depois é
// despachado só para eles (argumentos indiretos derivados da contagem). A ordem da fila varia entre quadros; nada do
// traçado depende dela (a semente de cada caminho é o pixel).
// A contagem vai também para o estado do quadro (`refraction_frame_out`, texel `REFRACTION_FRAME_COUNT`): o traçado
// ignora as invocações além dela.
// Em meia resolução (spec 039 refeita, `refraction_block.wgsl`): só o representante do bloco 2×2 no quadro entra.
// Requer: WORKGROUP_SIZE, REFRACTION_REQUEST_VALID, REFRACTION_FRAME_COUNT, refraction_block, refraction_request,
// refraction_queue_out, refraction_queue_count, refraction_frame_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_queue_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(refraction_request);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let pixel = vec2u(i % size.x, i / size.x);
    let rep = refraction_block_rep(pixel, size);
    if (rep.z == 0u || any(rep.xy != pixel)) { return; }
    let k = atomicAdd(&refraction_queue_count[0], 1u);
    textureStore(refraction_queue_out, vec2u(k % size.x, k / size.x), vec4u(i, 0u, 0u, 0u));
}

@compute @workgroup_size(1)
fn refraction_queue_count_main() {
    textureStore(refraction_frame_out, vec2u(REFRACTION_FRAME_COUNT, 0u),
        vec4u(atomicLoad(&refraction_queue_count[0]), 0u, 0u, 0u));
}
