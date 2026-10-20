// Desenho forward. Structs `CameraMatrices`, `WorldTransform`, `Renderable`, `RenderInstance`, `SurfaceDiff`,
// `StandardMaterial` e `ForwardFrameParams` gerados dos schemas; os recursos (câmeras, mundo, registros, instâncias,
// geometria diferencial, material, parâmetros do quadro) são declarados pelo módulo (spec 031). Projeção pelo ponto
// `camera_clip` (pronta: `viewProjection`; spec 009); o fechamento de espalhamento pelo ponto `material_eval` (pronto: o
// das constantes do material; spec 011). A luz chega pelo ponto de cena `scene_lighting` (spec 011): as luzes do pool,
// o hemisfério, a sombra e a água contribuem sem o desenho conhecê-los. Sombreamento físico em HDR: a cor sai linear,
// sem corte (a apresentação mapeia).

struct VsIn {
    @location(0) position: vec3<f32>,
    @location(1) normal:   vec3<f32>,
    @location(2) uv:       vec2<f32>,
}

struct VsOut {
    // Invariante: o passe de profundidade e o de cor (pipelines distintos) chegam à mesma profundidade bit a bit.
    @builtin(position) @invariant clip_position: vec4<f32>,
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
    // Origem do objeto em mundo (spec 011: a corda dos transmissivos convexos simétricos em torno dela).
    @location(8) @interpolate(flat) origin: vec3<f32>,
    // Vetores de movimento (spec 034): o ponto em clip no quadro anterior e neste, sem o deslocamento da amostra.
    @location(9) motion_previous: vec4<f32>,
    @location(10) motion_current: vec4<f32>,
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
    out.origin = w.world[3].xyz;
    let cam = cameras[forward_frame.cameraSlot];
    out.motion_current = cam.unjitteredViewProjection * world;
    out.motion_previous = cam.previousViewProjection * (previous_worlds[r.transformSlot].world * vec4<f32>(in.position, 1.0));
    if (r.diffSlot != NONE) {
        let d = surface_diff[r.diffSlot + vertex];
        out.metric = d.metric.xyz;
        out.curvature = d.curvature;
        let dir = mat3x3<f32>(w.world[0].xyz, w.world[1].xyz, w.world[2].xyz) * d.principal.xyz;
        out.principal = select(vec3<f32>(0.0), normalize(dir), d.principal.w > 0.0 && dot(dir, dir) > 0.0);
    }
    return out;
}

// Fragmento do passe de profundidade (spec 033): nada a sombrear — só a profundidade do vértice é gravada.
@fragment
fn fs_depth() {}

// Passe de movimento (spec 034): o deslocamento do ponto do pixel na tela desde o quadro anterior, em uv (anterior −
// atual), sem o deslocamento da amostra. Depois do passe principal, com a profundidade dele (teste igual).
@fragment
fn fs_motion(in: VsOut) -> @location(0) vec2<f32> {
    let previous = in.motion_previous.xy / in.motion_previous.w;
    let current = in.motion_current.xy / in.motion_current.w;
    return (previous - current) * vec2<f32>(0.5, -0.5);
}

// Direção para o observador no ponto `p`: da posição da câmera (perspectiva) ou o eixo da vista (ortográfica).
fn forward_view_dir(cam: CameraMatrices, p: vec3f) -> vec3f {
    let axis = vec3f(cam.view[0].z, cam.view[1].z, cam.view[2].z);
    return select(normalize(cam.position.xyz - p), normalize(axis), cam.projection[3].w == 1.0);
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let material = materials[in.material_slot];
    let n = normalize(in.world_normal);
    // Variância da normal na tela (controle de serrilhado especular) e a largura do pixel no ponto (filtragem na origem,
    // spec 034) em fluxo uniforme, antes de qualquer ramo.
    let variance = bsdf_normal_variance(n);
    let footprint = max(length(dpdx(in.world_position)), length(dpdy(in.world_position)));
    let duvdx = dpdx(in.uv);
    let duvdy = dpdy(in.uv);
    // Fechamento pelo ponto `material` (spec 009/011; pronto: o das constantes do material).
    let sample = SurfaceSample(
        in.world_position,
        n,
        in.uv,
        forward_frame.time,
        in.metric,
        in.curvature,
        in.principal,
        footprint,
        duvdx,
        duvdy,
    );
    let c = closure_specular_aa(material_eval(sample, material, in.fn_slot), variance);
    let v = forward_view_dir(cameras[forward_frame.cameraSlot], in.world_position);
    let color = scene_lighting(c, in.world_position, n, v) + closure_emitted(c, n, v);
    // A névoa entre a câmera e o ponto (ponto de cena `scene_fog`; sem névoa, nada muda).
    let fog = scene_fog(in.world_position);
    return vec4<f32>(color * fog.a + fog.rgb, c.opacity);
}
