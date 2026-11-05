// Referencial do mapa de sombra virtual no quadro (spec 034, T060): para cada luz direcional que projeta, a base do
// espaço da luz (x e y no plano da luz; z na direção dela, com o "para cima" trocado na luz vertical), a câmera nesse
// espaço, os níveis ativos (do primeiro, de meio lado `firstLevelRadius`, até cobrir o plano distante da câmera), a meia
// faixa de profundidade de uma página (o plano distante) e a sequência do antisserrilhado (a rotação da penumbra e o
// deslocamento das amostras dentro do texel). O referencial do quadro anterior (atraso 1 da série) diz se o cache das
// páginas vale: a luz, o primeiro nível, as páginas por nível e o atlas iguais, e a série contínua — senão `direction.w`
// = 1 e o estágio de sombra recomeça as páginas.
// As entradas estão em `shadow_matrix_eye.wgsl` (a câmera ativa, pelo pool das matrizes) e `shadow_matrix_origin.wgsl`
// (sem câmera: os níveis em volta da origem e a vista-projeção zero).
// Requer: structs Light, ShadowMap, ShadowMatrix, ShadowRecord, ShadowMatrixInstance, ShadowMatrixParams.

/** O referencial da luz `i` da lista com a câmera em `eye` e a vista-projeção `view_projection`. */
fn shadow_matrix_write(i: u32, eye: vec3f, view_projection: mat4x4f) {
    if (i >= shadow_params.count) { return; }
    let r = shadow_records[shadow_list[shadow_params.first + i].record];
    let map = shadow_maps[r.shadowSlot];
    let dir = normalize(lights[r.lightSlot].direction.xyz);
    let up = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(dir.y) > 0.99);
    let x = normalize(cross(up, dir));
    let y = cross(dir, x);
    // Mundo → luz: as linhas são x, y e a direção (rotação pura; a âncora das páginas é a origem do mundo).
    let view = mat4x4f(
        vec4f(x.x, y.x, dir.x, 0.0),
        vec4f(x.y, y.y, dir.y, 0.0),
        vec4f(x.z, y.z, dir.z, 0.0),
        vec4f(0.0, 0.0, 0.0, 1.0),
    );
    let camera = (view * vec4f(eye, 1.0)).xyz;
    let far = max(shadow_params.far, map.firstLevelRadius);
    let levels = u32(clamp(ceil(log2(far / map.firstLevelRadius)) + 1.0, 1.0, f32(SV_MAX_LEVELS)));
    let previous = shadow_matrices_previous[r.shadowSlot];
    let same = shadow_params.previousValid != 0u
        && dot(previous.direction.xyz, dir) > 0.999999
        && previous.firstLevelRadius == map.firstLevelRadius
        && previous.pagesPerLevel == map.pagesPerLevel
        && previous.atlasPages == map.atlasPages;
    var m: ShadowMatrix;
    m.lightView = view;
    m.viewProjection = view_projection;
    m.camera = vec4f(camera, f32(levels));
    m.direction = vec4f(dir, select(1.0, 0.0, same));
    m.kernelRotation = shadow_params.kernelRotation;
    m.texelJitter = shadow_params.texelJitter;
    m.firstLevelRadius = map.firstLevelRadius;
    m.depthRange = far;
    m.pagesPerLevel = map.pagesPerLevel;
    m.atlasPages = map.atlasPages;
    shadow_matrices[r.shadowSlot] = m;
}
