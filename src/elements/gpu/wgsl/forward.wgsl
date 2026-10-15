// Desenho forward. Structs `CameraMatrices`, `WorldTransform`, `Renderable`, `RenderInstance`, `StandardMaterial`,
// `ForwardFrameParams`, `ShadowMap`, `ShadowMatrix` e `Light` gerados dos schemas. Projeção pelo ponto `camera_clip`
// (pronta: `viewProjection`; spec 009); parâmetros de superfície pelo ponto `material_eval` (pronto: as constantes).
// Matrizes das câmeras (produzidas na GPU pelo estágio de câmera); a ativa no `cameraSlot` dos parâmetros do quadro.
@group(0) @binding(0) var<storage, read> cameras: array<CameraMatrices>;
// Pool WorldTransform, o registro de desenho de cada entidade (`Renderable`) e a lista de instâncias dos grupos
// (`RenderInstance`): um desenho por grupo (geometria, pipeline); a instância acha o registro pela lista.
@group(1) @binding(0) var<storage, read> worlds: array<WorldTransform>;
@group(1) @binding(1) var<storage, read> renderables: array<Renderable>;
@group(1) @binding(2) var<storage, read> instances: array<RenderInstance>;
// Geometria diferencial das superfícies `differential` (spec 010), pelo `diffSlot` do registro + índice do vértice.
@group(1) @binding(3) var<storage, read> surface_diff: array<SurfaceDiff>;
// Pool do material do schema do pipeline, indexado pelo `materialSlot` do registro.
@group(2) @binding(0) var<storage, read> materials: array<StandardMaterial>;
// Parâmetros do quadro (slots da câmera, da luz e do mapa de sombra; sombra ligada), o mapa de sombra da luz (textura,
// vieses e a matriz produzida na GPU) e o pool de luzes (a direção da luz que ilumina vem de lá).
@group(3) @binding(0) var<uniform> forward_frame: ForwardFrameParams;
@group(3) @binding(1) var shadow_map: texture_depth_2d;
@group(3) @binding(2) var shadow_sampler: sampler_comparison;
@group(3) @binding(3) var<storage, read> shadow_maps: array<ShadowMap>;
@group(3) @binding(4) var<storage, read> shadow_matrices: array<ShadowMatrix>;
@group(3) @binding(5) var<storage, read> lights: array<Light>;
// Cáusticas da água (spec 017): o fator de transmissão da luz (rgb) e a profundidade da água, os dois na vista da luz
// da água (a direção da luz que projeta sombra, enquadrada na água); ligados por `causticsEnabled` (sem água,
// substitutos e o caminho de antes).
@group(3) @binding(6) var caustic_map: texture_2d<f32>;
@group(3) @binding(7) var water_light_depth: texture_2d<f32>;
@group(3) @binding(8) var<storage, read> water_light_matrix: WaterLightMatrix;

// Direção da luz sem luz que ilumina (`lightSlot` = 0xFFFFFFFF).
const DEFAULT_LIGHT_DIR = vec3f(0.4, -1.0, 0.6);

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
    if (r.diffSlot != 0xFFFFFFFFu) {
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
    var light_dir = DEFAULT_LIGHT_DIR;
    if (forward_frame.lightSlot != 0xFFFFFFFFu) {
        light_dir = lights[forward_frame.lightSlot].direction.xyz;
    }
    let l = normalize(-light_dir);
    let n_dot_l = lambert_diffuse(n, l);
    let sm = shadow_maps[forward_frame.shadowSlot];
    let light_view_proj = shadow_matrices[forward_frame.shadowSlot].lightViewProj;
    let shadow_factor = sample_shadow_pcf(
        shadow_map, shadow_sampler, light_view_proj, in.world_position, sm.bias, forward_frame.shadowEnabled, n_dot_l,
    );
    if (forward_frame.causticsEnabled > 0.5) {
        let caustic = water_caustic_factor(in.world_position, water_light_matrix.viewProj);
        var lit = (BRDF_AMBIENT + n_dot_l * BRDF_DIFFUSE * shadow_factor * caustic) * albedo.rgb;
        if (any(surface.emissive != vec3f(0.0))) { lit += surface.emissive; }
        return vec4<f32>(lit, albedo.a);
    }
    var color = lambert_lit(albedo.rgb, n_dot_l, shadow_factor);
    if (any(surface.emissive != vec3f(0.0))) { color += surface.emissive; }
    return vec4<f32>(color, albedo.a);
}

// Transmissão da luz pela água no ponto: abaixo da superfície vista pela luz, o mapa de cáusticas (bilinear); acima
// ou fora da água, 1.
fn water_caustic_factor(world_pos: vec3f, light_view_proj: mat4x4f) -> vec3f {
    let lp = light_view_proj * vec4f(world_pos, 1.0);
    let ndc = lp.xyz / max(lp.w, 1e-6);
    let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec3f(1.0); }
    let dims = vec2i(textureDimensions(water_light_depth));
    let sz = length(vec3f(light_view_proj[0].z, light_view_proj[1].z, light_view_proj[2].z));
    let depth = ndc.z / sz;
    let f = uv * vec2f(dims) - 0.5;
    let b = vec2i(floor(f));
    let w = f - floor(f);
    let hi = dims - 1;
    // Cobertura da água sobre o ponto, interpolada entre os 4 texels da vista da luz (como o PCF da sombra): o
    // ponto está embaixo da água no texel cuja superfície fica acima dele (viés de 2 cm: a própria superfície e o que
    // a toca não ficam "embaixo"). Sem a interpolação, uma gota isolada marcava o fundo com o quadrado do seu texel.
    let t00 = clamp(b, vec2i(0), hi);
    let t10 = clamp(b + vec2i(1, 0), vec2i(0), hi);
    let t01 = clamp(b + vec2i(0, 1), vec2i(0), hi);
    let t11 = clamp(b + vec2i(1, 1), vec2i(0), hi);
    let u00 = select(0.0, 1.0, depth > textureLoad(water_light_depth, t00, 0).x + 0.02);
    let u10 = select(0.0, 1.0, depth > textureLoad(water_light_depth, t10, 0).x + 0.02);
    let u01 = select(0.0, 1.0, depth > textureLoad(water_light_depth, t01, 0).x + 0.02);
    let u11 = select(0.0, 1.0, depth > textureLoad(water_light_depth, t11, 0).x + 0.02);
    let coverage = mix(mix(u00, u10, w.x), mix(u01, u11, w.x), w.y);
    if (coverage <= 0.0) { return vec3f(1.0); }
    let c00 = textureLoad(caustic_map, t00, 0).rgb;
    let c10 = textureLoad(caustic_map, t10, 0).rgb;
    let c01 = textureLoad(caustic_map, t01, 0).rgb;
    let c11 = textureLoad(caustic_map, t11, 0).rgb;
    let caustic = mix(mix(c00, c10, w.x), mix(c01, c11, w.x), w.y);
    return mix(vec3f(1.0), caustic, coverage);
}
