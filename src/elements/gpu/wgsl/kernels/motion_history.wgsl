// Histórico de movimento (spec 034, R3): a matriz de mundo do quadro anterior de cada slot, copiada da de agora no
// início do quadro (antes de qualquer escrita nas de mundo). Os dois pools moram na arena da GPU (T060i): a cópia é um
// kernel — o WebGPU não copia de um buffer para ele mesmo.
// Requer: worlds (leitura), previous_worlds (escrita).

@compute @workgroup_size(WORKGROUP_SIZE)
fn motion_history_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= min(arrayLength(&worlds), arrayLength(&previous_worlds))) { return; }
    previous_worlds[i].world = worlds[i].world;
    previous_worlds[i].normal = worlds[i].normal;
}
