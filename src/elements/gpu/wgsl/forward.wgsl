// Desenho forward. Structs `CameraMatrices`, `WorldTransform`, `Renderable`, `RenderInstance`, `SurfaceDiff`,
// `StandardMaterial` e `ForwardFrameParams` gerados dos schemas; os recursos (câmeras, mundo, registros, instâncias,
// geometria diferencial, material, parâmetros do quadro) são declarados pelo módulo (spec 031). Projeção pelo ponto
// `camera_clip` (pronta: `viewProjection`; spec 009); parâmetros de superfície pelo ponto `material_eval` (pronto: as
// constantes). A luz chega pelos pontos de cena (spec 031): `scene_light_direction` (pronta: a direção padrão),
// `light_visibility` (pronta: 1 — sem sombra) e `light_transmission` (pronta: ambiente + direta) — a luz que projeta sombra
// e a água contribuem sem o desenho conhecê-las.

struct VsIn {
    @location(0) position: vec3<f32>,
    @location(1) normal:   vec3<f32>,
    @location(2) uv:       vec2<f32>,
}

struct VsOut {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_normal: vec3<f32>,
    @location(1) world_position: vec3<f32>,
    @location(2) @interpolate(flat) material_slot: u32,
    // uv da geometria e o slot da função `material` da entidade (spec 009).
    @location(3) uv: vec2<f32>,
    @location(4) @interpolate(flat) fn_slot: u32,
    // Geometria diferencial interpolada (spec 010): E, F, G; K, H, k1, k2; direção principal em mundo.
    @location(5) metric: vec3<f32>,
    @location(6) curvature: vec4<f32>,
    @location(7) principal: vec3<f32>,
}

@vertex
fn vs_main(
    in: VsIn,
    @builtin(instance_index) instance: u32,
    @builtin(vertex_index) vertex: u32,
) -> VsOut {
    var out: VsOut;
    let r = renderables[instances[instance].renderable];
    let w = worlds[r.transformSlot];
    let world = w.world * vec4<f32>(in.position, 1.0);
    out.clip_position = camera_clip(forward_frame.cameraSlot, world);
    out.world_position = world.xyz;
    out.world_normal = w.normal * in.normal;
    out.material_slot = r.materialSlot;
    out.uv = in.uv;
    out.fn_slot = r.fnSlot;
    if (r.diffSlot != NONE) {
        let d = surface_diff[r.diffSlot + vertex];
        out.metric = d.metric.xyz;
        out.curvature = d.curvature;
        let dir = mat3x3<f32>(w.world[0].xyz, w.world[1].xyz, w.world[2].xyz) * d.principal.xyz;
        out.principal = select(vec3<f32>(0.0), normalize(dir), d.principal.w > 0.0 && dot(dir, dir) > 0.0);
    }
    return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let material = materials[in.material_slot];
    let n = normalize(in.world_normal);
    // Parâmetros de superfície pelo ponto `material` (spec 009; pronto: as constantes do material, sem emissão).
    let sample = SurfaceSample(
        in.world_position,
        n,
        in.uv,
        forward_frame.time,
        in.metric,
        in.curvature,
        in.principal,
    );
    let surface = material_eval(sample, material, in.fn_slot);
    let albedo = surface.base_color;
    let l = normalize(-scene_light_direction());
    let n_dot_l = lambert_diffuse(n, l);
    let shadow_factor = light_visibility(in.world_position, n_dot_l);
    var color = light_transmission(in.world_position, BRDF_AMBIENT, n_dot_l * BRDF_DIFFUSE * shadow_factor)
        * albedo.rgb;
    if (any(surface.emissive != vec3f(0.0))) { color += surface.emissive; }
    return vec4<f32>(color, albedo.a);
}
