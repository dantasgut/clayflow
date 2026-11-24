// Referencial do mapa de sombra virtual no quadro (spec 034, T060; spec 013: as vistas em perspectiva das luzes de foco e
// pontuais, em `shadow_matrix_local`): para cada luz direcional que projeta, a base do
// espaço da luz (x e y no plano da luz; z na direção dela, com o "para cima" trocado na luz vertical), a câmera nesse
// espaço, os níveis ativos (do primeiro, de meio lado `firstLevelRadius`, até cobrir o plano distante da câmera), a meia
// faixa de profundidade de uma página (o plano distante) e a sequência do antisserrilhado (a rotação da penumbra e o
// deslocamento das amostras dentro do texel). O referencial do quadro anterior (atraso 1 da série) diz se o cache das
// páginas vale: a luz na direção do cache (até `SHADOW_CACHE_TURN`), o primeiro nível, as páginas por nível e o atlas
// iguais, e a série contínua — senão `direction.w` = 1 e o estágio de sombra recomeça as páginas. Enquanto vale, o
// referencial é o da direção do cache.
// A vista no atlas único (spec 013): o mapa traz o índice da faixa dele (`view`) e o atlas, as faixas (`shadow_atlas_params`);
// o referencial leva a primeira palavra da tabela e dos pedidos da vista e a das páginas físicas. A faixa ou o
// reservatório mudados também recomeçam o cache. A luz com `castShadow` desligado, ou o mapa sem vista (acima do teto),
// fica com o referencial vazio (nenhum nível): nada é pedido, alocado nem lido.
// As entradas estão em `shadow_matrix_eye.wgsl` (a câmera ativa, pelo pool das matrizes) e `shadow_matrix_origin.wgsl`
// (sem câmera: os níveis em volta da origem e a vista-projeção zero).
// Requer: structs Light, ShadowMap, ShadowMatrix, ShadowRecord, ShadowMatrixInstance, ShadowMatrixParams, ShadowAtlas.

/**
 * Quanto a direção da luz pode se afastar da do cache das páginas sem ele recomeçar (rad): 10⁻⁴ (0,006°) desloca a
 * sombra 0,1 mm por metro entre quem a projeta e quem a recebe — abaixo do texel do nível mais fino. Além disso, a
 * sombra é redesenhada na direção de agora.
 */
const SHADOW_CACHE_TURN: f32 = 1.0e-4;

/** O referencial da luz `i` da lista com a câmera em `eye` e a vista-projeção `view_projection`. */
fn shadow_matrix_write(i: u32, eye: vec3f, view_projection: mat4x4f) {
    if (i >= shadow_params.count) { return; }
    let r = shadow_records[shadow_list[shadow_params.first + i].record];
    let map = shadow_maps[r.shadowSlot];
    let emitter = lights[r.lightSlot];
    if (emitter.castShadow == 0u || map.view >= shadow_atlas_params.views) {
        // Fora das vistas vivas: o referencial vazio, com o cache por recomeçar quando voltar.
        var none: ShadowMatrix;
        none.direction = vec4f(0.0, 0.0, 0.0, 1.0);
        shadow_matrices[r.shadowSlot] = none;
        return;
    }
    let previous = shadow_matrices_previous[r.shadowSlot];
    let table_base = map.view * shadow_atlas_params.stripTableWords;
    let request_base = map.view * shadow_atlas_params.stripRequestWords;
    if (emitter.kind != 0u) {
        shadow_matrices[r.shadowSlot] = shadow_matrix_local(emitter, map, previous, eye, view_projection, table_base, request_base);
        return;
    }
    let light = normalize(emitter.direction.xyz);
    // A direção com que as páginas do cache foram desenhadas (não a do quadro anterior): a luz que gira devagar não
    // acumula desvio quadro a quadro — passado o limiar desde ela (`SHADOW_CACHE_TURN`), o cache recomeça com a direção
    // de agora.
    let turn = light - previous.cacheDirection.xyz;
    let same = shadow_params.previousValid != 0u
        && dot(turn, turn) < SHADOW_CACHE_TURN * SHADOW_CACHE_TURN
        && previous.firstLevelRadius == map.firstLevelRadius
        && previous.pagesPerLevel == map.pagesPerLevel
        && previous.atlasPages == shadow_atlas_params.atlasPages
        && previous.tableBase == table_base
        && previous.requestBase == request_base
        && previous.pagesBase == shadow_atlas_params.pagesBase
        && sv_levels(previous) != 0u;
    // Enquanto o cache vale, o referencial é o das páginas dele: as páginas, os retângulos das instâncias e a leitura da
    // imagem no mesmo plano da luz (com o da direção de agora, cada quadro abaixo do limiar moveria todos os retângulos
    // e sujaria todas as páginas, lidas num plano que não é o do desenho delas).
    let dir = select(light, previous.cacheDirection.xyz, same);
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
    var m: ShadowMatrix;
    m.lightView = view;
    m.viewProjection = view_projection;
    m.camera = vec4f(camera, f32(levels));
    m.direction = vec4f(dir, select(1.0, 0.0, same));
    m.cacheDirection = vec4f(dir, 0.0);
    m.kernelRotation = shadow_params.kernelRotation;
    m.texelJitter = shadow_params.texelJitter;
    m.firstLevelRadius = map.firstLevelRadius;
    m.depthRange = far;
    m.pagesPerLevel = map.pagesPerLevel;
    m.atlasPages = shadow_atlas_params.atlasPages;
    m.tableBase = table_base;
    m.requestBase = request_base;
    m.pagesBase = shadow_atlas_params.pagesBase;
    // A vista ortográfica da luz direcional (as vistas em perspectiva, de foco e pontual, têm a origem e os planos).
    m.kind = 0u;
    m.origin = vec4f(0.0);
    m.near = 0.0;
    m.far = 0.0;
    m.eye = vec4f(eye, shadow_params.pixelSize);
    m.pixel = shadow_params.pixelAngle;
    m.views = 1u;
    m.stripWords = shadow_atlas_params.stripTableWords;
    shadow_matrices[r.shadowSlot] = m;
}

/** O plano próximo de uma vista em perspectiva, como fração do alcance dela (o que está mais perto da luz não projeta). */
const SHADOW_LOCAL_NEAR: f32 = 1.0e-3;

/**
 * O referencial em perspectiva de uma luz local (spec 013, R4): a de foco (uma vista, o eixo na direção dela e a
 * abertura do cone externo) e a pontual (seis vistas de 90°, as faces do cubo em volta da posição: o referencial guarda a
 * origem e a faixa da primeira, e `sv_face` dá o de cada face). A origem na luz; o tronco vai de uma fração do alcance
 * (`SHADOW_LOCAL_NEAR`) ao alcance (sem alcance, o plano distante da câmera); os níveis são os de resolução do tronco
 * (⌊log₂ N⌋). O cache das páginas vale enquanto a luz não muda de lugar, de eixo, de abertura nem de alcance — a câmera
 * pode andar: as páginas são do espaço da luz. A câmera entra só no nível pela resolução na tela (`eye`, `pixel`).
 */
fn shadow_matrix_local(
    emitter: Light,
    map: ShadowMap,
    previous: ShadowMatrix,
    eye: vec3f,
    view_projection: mat4x4f,
    table_base: u32,
    request_base: u32,
) -> ShadowMatrix {
    let spot = emitter.kind == 2u;
    let origin = emitter.position.xyz;
    // O eixo da vista: a direção da luz de foco; na pontual, o da primeira face.
    let axis = select(sv_cube_axis(0u), normalize(emitter.direction.xyz), spot);
    let tan_half = select(1.0, tan(clamp(emitter.cones.y, 1.0e-3, SV_CONE_MAX)), spot);
    let far = select(max(shadow_params.far, 1.0e-3), emitter.range, emitter.range > 0.0);
    let near = far * SHADOW_LOCAL_NEAR;
    let views = select(6u, 1u, spot);
    let same = shadow_params.previousValid != 0u
        && previous.kind == 1u
        && all(previous.origin == vec4f(origin, tan_half))
        && all(previous.cacheDirection.xyz == axis)
        && previous.near == near
        && previous.far == far
        && previous.views == views
        && previous.pagesPerLevel == map.pagesPerLevel
        && previous.atlasPages == shadow_atlas_params.atlasPages
        && previous.tableBase == table_base
        && previous.requestBase == request_base
        && previous.pagesBase == shadow_atlas_params.pagesBase
        && previous.stripWords == shadow_atlas_params.stripTableWords
        && sv_levels(previous) != 0u;
    let levels = max(u32(floor(log2(f32(max(map.pagesPerLevel, 2u))))), 1u);
    var m: ShadowMatrix;
    m.lightView = sv_frame(axis, origin);
    m.viewProjection = view_projection;
    // O centro do tronco no plano da vista e a referência de profundidade das páginas (o meio do tronco).
    m.camera = vec4f(0.0, 0.0, 0.5 * (near + far), f32(levels));
    m.direction = vec4f(axis, select(1.0, 0.0, same));
    m.cacheDirection = vec4f(axis, 0.0);
    m.kernelRotation = shadow_params.kernelRotation;
    m.texelJitter = shadow_params.texelJitter;
    // O tronco tem meio lado 1 no plano da vista.
    m.firstLevelRadius = 1.0;
    m.depthRange = 0.5 * (far - near);
    m.pagesPerLevel = map.pagesPerLevel;
    m.atlasPages = shadow_atlas_params.atlasPages;
    m.tableBase = table_base;
    m.requestBase = request_base;
    m.pagesBase = shadow_atlas_params.pagesBase;
    m.kind = 1u;
    m.origin = vec4f(origin, tan_half);
    m.near = near;
    m.far = far;
    m.eye = vec4f(eye, shadow_params.pixelSize);
    m.pixel = shadow_params.pixelAngle;
    m.views = views;
    m.stripWords = shadow_atlas_params.stripTableWords;
    return m;
}
