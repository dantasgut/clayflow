// Superfície da água pelo campo dos fluidos (spec 033, R11): a superfície genérica do `WaterSurface` (profundidade
// linear, material e normal com a espessura em w por pixel) escrita pela marcha de um raio por pixel no campo — sem esferas nem
// suavização na tela: a silhueta e a normal são as do campo (contínuas, sem ondulação na escala das partículas) em
// qualquer resolução. Vista da câmera: o raio do pixel até a profundidade da cena (a água atrás de um objeto não entra);
// a espessura é a corda até a saída do fluido (ou até a cena). Vista da luz: raios paralelos à luz no enquadramento
// ajustado à caixa do campo (`water_field_fit`), a profundidade métrica desde o topo da caixa. A normal sai em mundo.
// O material escrito é o slot + 1 do `FluidSurfaceMaterial` do corpo atingido (pela tabela dos corpos do campo); os
// corpos sem ele (a aparência pelo grafo, spec 034 T065d) não são desenhados por aqui.
// Structs `CameraMatrices`, `ShadowMatrix`, `WaterLightMatrix`, `FluidSurfaceMaterial` e `WaterViewParams` gerados dos
// schemas; recursos declarados em `water/shaders.ts`; o campo em `fields/shaders.ts`.

// Espessura a ¼ dos pixels: a do primeiro pixel de cada 2 × 2 (absorção e refração variam devagar), compartilhada no
// grupo; um pixel cujo representante não acertou a água (a silhueta) mede a sua.
var<workgroup> water_field_thickness: array<f32, 16>;

@compute @workgroup_size(8, 8)
fn water_field_camera(
    @builtin(global_invocation_id) gid: vec3u,
    @builtin(local_invocation_id) lid: vec3u,
) {
    let size = vec2u(water_view.viewport);
    let inside = all(gid.xy < size);
    let texel = vec2i(gid.xy);
    let cam = cameras[water_view.cameraSlot];
    let proj = cam.projection;
    let pixel = vec2f(min(gid.xy, size - 1u)) + 0.5;
    let ndc = pixel_to_ndc(pixel, vec2f(size));
    // Raio do pixel na vista (perspectiva: da origem; ortográfica: paralelo a −z) e em mundo (vista rígida).
    var ov = vec3f(0.0);
    var dv = vec3f(0.0, 0.0, -1.0);
    if (!is_orthographic(proj)) {
        // O deslocamento da amostra do quadro (spec 034) está em proj[2].xy: tirado do NDC do raio.
        let q = ndc - cam.jitter.xy;
        dv = normalize(vec3f(q.x / proj[0].x, q.y / proj[1].y, -1.0));
    } else {
        ov = vec3f((ndc.x - proj[3].x) / proj[0].x, (ndc.y - proj[3].y) / proj[1].y, 0.0);
    }
    let rt = mat3x3f(cam.inverseView[0].xyz, cam.inverseView[1].xyz, cam.inverseView[2].xyz);
    let o = rt * (ov - cam.view[3].xyz);
    let d = rt * dv;
    let t_scene = water_scene_linear(pixel, proj) / max(-dv.z, 1e-6);
    // Do plano próximo (como a geometria: um borrifo colado na câmera é cortado, não enche a tela de água).
    var near = 0.0;
    if (!is_orthographic(proj) && abs(proj[2].z) > 1e-12) { near = proj[3].z / proj[2].z; }
    let span = field_clip(o, d, max(near, 0.0) / max(-dv.z, 1e-6), t_scene);
    var hit = FieldHit(span.y, o, -d, 0u, false);
    if (inside && span.x < span.y) { hit = field_march(o, d, span.x, span.y, false, true, false); }
    let surface = field_body(hit.body).z;
    let wet = hit.hit && surface > 0u;
    // Corda até a saída do fluido (sem saída antes da cena ou da caixa, até ela), nos representantes.
    let representative = (lid.x & 1u) == 0u && (lid.y & 1u) == 0u;
    var chord = -1.0;
    if (representative && wet) { chord = max(field_march(o, d, hit.t + field_voxel(), span.y, true, false, false).t - hit.t, 0.0); }
    if (representative) { water_field_thickness[(lid.x >> 1u) + 4u * (lid.y >> 1u)] = chord; }
    workgroupBarrier();
    if (!inside) { return; }
    var depth = WATER_NO_DEPTH;
    var material = 0u;
    var normal = vec4f(0.0);
    if (wet) {
        depth = hit.t * -dv.z;
        material = surface;
        var length = water_field_thickness[(lid.x >> 1u) + 4u * (lid.y >> 1u)];
        if (length < 0.0) { length = max(field_march(o, d, hit.t + field_voxel(), span.y, true, false, false).t - hit.t, 0.0); }
        normal = vec4f(hit.n, length * water_materials[material - 1u].thicknessScale);
    }
    textureStore(field_out_depth, texel, vec4f(depth, 0.0, 0.0, 0.0));
    textureStore(field_out_material, texel, vec4u(material, 0u, 0u, 0u));
    textureStore(field_out_normal, texel, normal);
}

@compute @workgroup_size(8, 8)
fn water_field_light(@builtin(global_invocation_id) gid: vec3u) {
    let size = vec2u(water_view.viewport);
    if (any(gid.xy >= size)) { return; }
    let texel = vec2i(gid.xy);
    let m = water_light_matrix.viewProj;
    let uv = (vec2f(gid.xy) + 0.5) / vec2f(size);
    let ndc = uv_to_ndc(uv);
    // As linhas da parte 3×3 são ortogonais: p = Σ linhaᵢ (ndcᵢ − tᵢ) / |linhaᵢ|², com o topo da caixa em z = 0.
    let r0 = vec3f(m[0].x, m[1].x, m[2].x);
    let r1 = vec3f(m[0].y, m[1].y, m[2].y);
    let r2 = vec3f(m[0].z, m[1].z, m[2].z);
    let o = r0 * ((ndc.x - m[3].x) / dot(r0, r0)) + r1 * ((ndc.y - m[3].y) / dot(r1, r1)) - r2 * (m[3].z / dot(r2, r2));
    let len = length(r2);
    let d = r2 / len;
    let span = field_clip(o, d, 0.0, 1.0 / len);
    var depth = WATER_NO_DEPTH;
    var material = 0u;
    var normal = vec4f(0.0);
    if (span.x < span.y) {
        let hit = field_march(o, d, span.x, span.y, false, true, false);
        let surface = field_body(hit.body).z;
        if (hit.hit && surface > 0u) {
            depth = hit.t;
            material = surface;
            normal = vec4f(hit.n, 1.0);
        }
    }
    textureStore(field_out_depth, texel, vec4f(depth, 0.0, 0.0, 0.0));
    textureStore(field_out_material, texel, vec4u(material, 0u, 0u, 0u));
    textureStore(field_out_normal, texel, normal);
}

@compute @workgroup_size(1)
fn water_field_fit() {
    let box = field_box();
    let basis = water_light_basis(shadow_matrices[water_view.shadowSlot].lightViewProj);
    var lo = vec3f(0.0);
    var hi = vec3f(1e-3);
    if (all(box[0] < box[1])) {
        lo = vec3f(1e30);
        hi = vec3f(-1e30);
        for (var k = 0u; k < 8u; k++) {
            let corner = select(box[0], box[1], vec3<bool>((k & 1u) != 0u, (k & 2u) != 0u, (k & 4u) != 0u));
            let q = transpose(basis) * corner;
            lo = min(lo, q);
            hi = max(hi, q);
        }
    }
    // Enquadramento estável: a caixa arredondada para cima em passos de 10 cm e o centro alinhado aos texels — a matriz
    // muda só quando a água sai do quadro atual (os texels das cáusticas não deslizam a cada quadro).
    let step = 0.1;
    let half = ceil(0.5 * max(hi.x - lo.x, hi.y - lo.y) / step) * step;
    let texel = 2.0 * (half * 1.25 + 0.05) / max(water_view.viewport.x, 1.0);
    let c = round(0.5 * (lo.xy + hi.xy) / (4.0 * texel)) * (4.0 * texel);
    let zlo = floor(lo.z / step) * step;
    let zhi = ceil(hi.z / step) * step;
    // Histerese: com a mesma direção de luz, a matriz anterior fica enquanto a água couber nela e não tiver encolhido
    // para menos de 60 % (cada troca desloca os texels das cáusticas e o acúmulo delas recomeça).
    let prev = light_matrix.viewProj;
    let p0 = vec3f(prev[0].x, prev[1].x, prev[2].x);
    let p2 = vec3f(prev[0].z, prev[1].z, prev[2].z);
    if (dot(p0, p0) > 0.0 && dot(p2, p2) > 0.0) {
        let prev_half = 1.0 / length(p0);
        let prev_dz = 1.0 / length(p2);
        let prev_c = -vec2f(prev[3].x, prev[3].y) * prev_half;
        let prev_zlo = -prev[3].z * prev_dz;
        let same_light = dot(normalize(p0), basis[0]) > 0.99999 && dot(normalize(p2), basis[2]) > 0.99999;
        let fits = all(abs(0.5 * (lo.xy + hi.xy) - prev_c) + vec2f(0.5 * max(hi.x - lo.x, hi.y - lo.y) * 1.25 + 0.05) <= vec2f(prev_half))
            && lo.z >= prev_zlo && hi.z <= prev_zlo + prev_dz;
        let new_half = half * 1.25 + 0.05;
        if (same_light && fits && new_half >= 0.6 * prev_half) { return; }
    }
    light_matrix.viewProj = water_light_fit_box(vec3f(c - vec2f(half), zlo), vec3f(c + vec2f(half), zhi), basis);
}
