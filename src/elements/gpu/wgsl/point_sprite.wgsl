// Sprites nos vértices de uma geometria (spec 008, `PointSpriteMaterial` no forward): um quad virado para a câmera por
// vértice, com a posição lida do vertex buffer da geometria como storage (`array<MeshVertex>`: posição, normal, uv) —
// geometria da CPU ou escrita por um estágio (`PointCloudGeometry`). `vertex_index / 6` é o vértice; a instância é a
// entidade do grupo (registro `Renderable`: matriz de mundo e material). A direção da luz vem do ponto de cena
// `scene_lighting` (spec 011): o fechamento da cor do material sobre a normal do impostor, o mesmo modelo do forward.
// Vértices da geometria do pipeline (binding privado por geometria).

struct PointOut {
    @builtin(position) clip_position: vec4f,
    @location(0) corner: vec2f,
    @location(1) @interpolate(flat) material_slot: u32,
    @location(2) center: vec3f,
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
    return out;
}

@fragment
fn fs_main(in: PointOut) -> @location(0) vec4f {
    let r2 = dot(in.corner, in.corner);
    if (r2 > 1.0) { discard; }
    let material = materials[in.material_slot];
    let camera = cameras[forward_frame.cameraSlot];
    let n_view = vec3f(in.corner, sqrt(1.0 - r2));
    let n = normalize(transpose(mat3x3f(camera.view[0].xyz, camera.view[1].xyz, camera.view[2].xyz)) * n_view);
    let p = in.center + n * material.radius;
    let v = normalize(camera.position.xyz - p);
    let c = closure_from_params(SurfaceParams(material.color, 0.5, 0.0, vec3f(0.0)));
    return vec4f(scene_lighting(c, p, n, v), material.color.a);
}
