// Sprites nos vértices de uma geometria (spec 008, `PointSpriteMaterial` no forward): um quad virado para a câmera por
// vértice, com a posição lida do vertex buffer da geometria como storage (`array<MeshVertex>`: posição, normal, uv) —
// geometria da CPU ou escrita por um estágio (`PointCloudGeometry`). `vertex_index / 6` é o vértice; a instância é a
// entidade do grupo (registro `Renderable`: matriz de mundo e material). A direção da luz vem do ponto de cena
// `scene_lighting` (spec 011): o fechamento da cor do material sobre a normal do impostor, o mesmo modelo do forward.
// Vértices da geometria do pipeline (binding privado por geometria). Com o antisserrilhado temporal (spec 034), o passe de
// movimento desenha o mesmo quadrado com `fs_motion`, pelos vértices do quadro anterior (`point_previous_vertices`).

struct PointOut {
    // Invariante: o passe de cor e o de movimento (teste igual) chegam à mesma profundidade bit a bit.
    @builtin(position) @invariant clip_position: vec4f,
    @location(0) corner: vec2f,
    @location(1) @interpolate(flat) material_slot: u32,
    @location(2) center: vec3f,
    // O centro em clip no quadro anterior e neste, sem o deslocamento da amostra (spec 034).
    @location(3) motion_previous: vec4f,
    @location(4) motion_current: vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) index: u32, @builtin(instance_index) instance: u32) -> PointOut {
    var out: PointOut;
    var corners = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
        vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
    );
    let corner = corners[index % 6u];
    let m = point_vertices[index / 6u];
    let r = renderables[instances[instance].renderable];
    let material = materials[r.materialSlot];
    let camera = cameras[forward_frame.cameraSlot];
    let local = vec3f(m.px, m.py, m.pz);
    out.corner = corner;
    out.material_slot = r.materialSlot;
    if (!all(abs(local) < vec3f(1e30))) {
        out.clip_position = vec4f(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    let world = worlds[r.transformSlot].world * vec4f(local, 1.0);
    out.center = world.xyz;
    let view = camera.view * world;
    out.clip_position = camera.projection * vec4f(view.xy + corner * material.radius, view.z, 1.0);
    // Vetores de movimento (spec 034): o vértice no quadro anterior (o da geometria que a GPU reescreve; nas outras, o
    // mesmo) pela matriz anterior; o ponto do quadrado acompanha o centro.
    let p = point_previous_vertices[index / 6u];
    // O ponto que nasceu neste quadro (o anterior fora do recorte, morto) fica sem movimento: a distância o recomeça.
    let before = select(local, vec3f(p.px, p.py, p.pz), all(abs(vec3f(p.px, p.py, p.pz)) < vec3f(1e8)));
    let previous = previous_worlds[r.transformSlot].world * vec4f(before, 1.0);
    let offset = vec4f(corner * material.radius, 0.0, 0.0);
    out.motion_current = camera.unjitteredViewProjection * world + camera.projection * offset;
    out.motion_previous = camera.previousViewProjection * previous + camera.projection * offset;
    return out;
}

// Passe de movimento (spec 034): o deslocamento do ponto do pixel na tela desde o quadro anterior, em uv (anterior −
// atual), o mesmo da superfície e do que está atrás (rg e ba), com a profundidade do passe principal (teste igual).
@fragment
fn fs_motion(in: PointOut) -> @location(0) vec4f {
    if (dot(in.corner, in.corner) > 1.0) { discard; }
    return motion_from_clips(in.motion_previous, in.motion_current);
}


@fragment
fn fs_main(in: PointOut) -> @location(0) vec4f {
    let r2 = dot(in.corner, in.corner);
    if (r2 > 1.0) { discard; }
    let material = materials[in.material_slot];
    let camera = cameras[forward_frame.cameraSlot];
    let n_view = vec3f(in.corner, sqrt(1.0 - r2));
    let n = normalize(mat3x3f(camera.inverseView[0].xyz, camera.inverseView[1].xyz, camera.inverseView[2].xyz) * n_view);
    let p = in.center + n * material.radius;
    let v = normalize(camera.position.xyz - p);
    let c = closure_from_params(SurfaceParams(material.color, 0.5, 0.0, vec3f(0.0)));
    let fog = scene_fog(p);
    return vec4f(scene_lighting(c, p, n, v) * fog.a + fog.rgb, material.color.a);
}
