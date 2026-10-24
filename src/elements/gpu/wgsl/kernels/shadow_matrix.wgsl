// Estágio da matriz de sombra (spec 007, research R11): para cada luz direcional que projeta, a matriz
// luz-vista-projeção do seu mapa — ortográfica ±10 (clip z em [0, 1]) com o olho a 10 m contra a direção da luz,
// mirando a origem (com o "para cima" trocado na luz vertical). Com o deslocamento da amostra (spec 034), a grade do
// mapa anda dentro do texel a cada quadro (o acúmulo integra o mapa supersamplado: a borda sem o degrau dos texels) e o
// padrão do PCF gira; a matriz deslocada é a mesma no desenho do mapa e na leitura.
// Requer: structs Light, ShadowMap, ShadowMatrix, ShadowRecord, ShadowMatrixInstance, ShadowMatrixParams; camera.

@compute @workgroup_size(WORKGROUP_SIZE)
fn shadow_matrix_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= shadow_params.count) { return; }
    let r = shadow_records[shadow_list[shadow_params.first + i].record];
    let dir = lights[r.lightSlot].direction.xyz;
    // "Para cima" da vista da luz: o eixo y, ou o z quando a luz é (quase) vertical — senão a base degenera.
    let up = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(normalize(dir).y) > 0.99);
    let view = camera_look_at(-dir * 10.0, vec3f(0.0), up);
    let projection = camera_orthographic_box(-10.0, 10.0, -10.0, 10.0, 0.1, 50.0);
    // Deslocamento em NDC (2 / tamanho por texel), aplicado depois da projeção: x' = x + o·w.
    let o = shadow_params.texelJitter * 2.0 / max(shadow_maps[r.shadowSlot].size, vec2f(1.0));
    shadow_matrices[r.shadowSlot].lightViewProj = camera_shift(projection * view, o);
    shadow_matrices[r.shadowSlot].kernelRotation = shadow_params.kernelRotation;
}
