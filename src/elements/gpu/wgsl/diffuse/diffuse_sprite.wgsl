// Desenho das partículas secundárias de um fluido (spec 010, `DiffuseMaterial`): um quad virado para a câmera por
// vértice da nuvem de pontos (posição; uv = tipo e fração de vida), com a aparência do tipo — spray: gotícula
// (esfera com reflexo especular e Fresnel, tom de água); espuma: disco branco que se dissolve com a vida (descarte
// pontilhado, sem mistura); bolha: anel claro. Morta: fora do recorte. Direção da luz pelo ponto de cena
// `scene_lighting` (spec 011): cada tipo com o seu fechamento sobre a normal do impostor, o mesmo modelo do forward.

struct DiffuseOut {
    @builtin(position) clip_position: vec4f,
    @location(0) corner: vec2f,
    @location(1) @interpolate(flat) material_slot: u32,
    @location(2) @interpolate(flat) kind: f32,
    @location(3) @interpolate(flat) life: f32,
    @location(4) @interpolate(flat) id: u32,
    @location(5) center: vec3f,
}

@vertex
fn vs_main(@builtin(vertex_index) index: u32, @builtin(instance_index) instance: u32) -> DiffuseOut {
    var out: DiffuseOut;
    var corners = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
        vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
    );
    let corner = corners[index % 6u];
    let point = index / 6u;
    let m = point_vertices[point];
    let r = renderables[instances[instance].renderable];
    let material = materials[r.materialSlot];
    let camera = cameras[forward_frame.cameraSlot];
    let local = vec3f(m.px, m.py, m.pz);
    out.corner = corner;
    out.material_slot = r.materialSlot;
    out.kind = m.u;
    out.life = m.v;
    out.id = point;
    if (!all(abs(local) < vec3f(1e8))) {
        out.clip_position = vec4f(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    let radius = material.radii[u32(clamp(out.kind, 0.0, 2.0))];
    let world = worlds[r.transformSlot].world * vec4f(local, 1.0);
    out.center = world.xyz;
    let view = camera.view * world;
    out.clip_position = camera.projection * vec4f(view.xy + corner * radius, view.z, 1.0);
    return out;
}

// Hash do pixel e da partícula → [0, 1) (descarte pontilhado da espuma).
fn diffuse_dither(p: vec2f, id: u32) -> f32 {
    var v = (u32(p.x) * 73856093u) ^ (u32(p.y) * 19349663u) ^ (id * 83492791u);
    v = v * 747796405u + 2891336453u;
    v = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
    return f32((v >> 22u) ^ v) / 4294967296.0;
}

@fragment
fn fs_main(in: DiffuseOut) -> @location(0) vec4f {
    let r2 = dot(in.corner, in.corner);
    if (r2 > 1.0) { discard; }
    let material = materials[in.material_slot];
    let camera = cameras[forward_frame.cameraSlot];
    let n_view = vec3f(in.corner, sqrt(1.0 - r2));
    let n = normalize(transpose(mat3x3f(camera.view[0].xyz, camera.view[1].xyz, camera.view[2].xyz)) * n_view);
    let radius = material.radii[u32(clamp(in.kind, 0.0, 2.0))];
    let p = in.center + n * radius;
    let v = normalize(camera.position.xyz - p);
    if (in.kind < 0.5) {
        // Spray: gotícula — água (dielétrico liso de IOR 1,33) sobre o tom do spray.
        let c = closure_add(
            closure_diffuse(material.spray_color.rgb, 0.0),
            closure_dielectric(1.33, vec3f(1.0), 0.05, 0.0, vec3f(0.0)),
        );
        return vec4f(scene_lighting(c, p, n, v), 1.0);
    }
    if (in.kind < 1.5) {
        // Espuma: some com a vida (descarte pontilhado) e é mais rala na borda; difusa e translúcida.
        let keep = in.life * (1.0 - r2 * 0.6);
        if (diffuse_dither(in.clip_position.xy, in.id) > keep) { discard; }
        let c = closure_add(closure_diffuse(material.foam_color.rgb, 1.0), closure_scale(closure_translucent(material.foam_color.rgb), 0.4));
        return vec4f(scene_lighting(c, p, n, v), 1.0);
    }
    // Bolha: anel (centro vazado) que reflete como água.
    if (r2 < 0.55) { discard; }
    let c = closure_add(
        closure_scale(closure_diffuse(material.bubble_color.rgb, 0.0), 0.3),
        closure_dielectric(1.33, vec3f(1.0), 0.05, 0.0, vec3f(0.0)),
    );
    return vec4f(scene_lighting(c, p, n, v), 1.0);
}
