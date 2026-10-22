// Fila da refração (spec 034, R1): uma invocação por pixel; os pixels com pedido entram na fila compacta (o texel k
// guarda o índice linear do k-ésimo, na largura do canvas linha a linha) pela contagem atômica — o traçado depois é
// despachado só para eles (argumentos indiretos derivados da contagem). A ordem da fila varia entre quadros; nada do
// traçado depende dela (a semente de cada caminho é o pixel).
// Requer: WORKGROUP_SIZE, REFRACTION_REQUEST_VALID, refraction_request, refraction_queue_out, refraction_queue_count.

@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_queue_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(refraction_request);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let pixel = vec2u(i % size.x, i / size.x);
    if ((textureLoad(refraction_request, pixel, 0).y & REFRACTION_REQUEST_VALID) == 0u) { return; }
    let k = atomicAdd(&refraction_queue_count[0], 1u);
    textureStore(refraction_queue_out, vec2u(k % size.x, k / size.x), vec4u(i, 0u, 0u, 0u));
}
