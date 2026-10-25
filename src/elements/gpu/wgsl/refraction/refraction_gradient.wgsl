// A marca de movimento do quadro anterior, por pixel (spec 034, R3a, T044a): antes do traçado do quadro (que reescreve o
// alfa de `refraction_albedo` com a marca de agora), copia a anterior para `refraction_gradient_out` — a parte da luz
// do pixel que veio por caminhos que tocaram uma instância que se moveu, 0 sem pedido. Quem recomeça históricos lê as
// duas (`refraction_change`): a de agora pega o objeto que entrou no caminho; a anterior, o que acabou de sair. Nenhum
// raio a mais.
// Requer: WORKGROUP_SIZE, REFRACTION_REQUEST_VALID, refraction_request, refraction_albedo, refraction_gradient_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_gradient_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(refraction_gradient_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let px = vec2u(i % size.x, i / size.x);
    let requested = (textureLoad(refraction_request, px, 0).y & REFRACTION_REQUEST_VALID) != 0u;
    let moving = select(0.0, textureLoad(refraction_albedo, px, 0).a, requested);
    textureStore(refraction_gradient_out, px, vec4f(moving, 0.0, 0.0, 0.0));
}
