// Desenho forward. Structs `CameraMatrices`, `WorldTransform`, `Renderable`, `RenderInstance`, `StandardMaterial`,
// `ForwardFrameParams`, `ShadowMap`, `ShadowMatrix` e `Light` gerados dos schemas. Projeção pelo ponto `camera_clip`
// (pronta: `viewProjection`; spec 009).
// Matrizes das câmeras (produzidas na GPU pelo estágio de câmera); a ativa no `cameraSlot` dos parâmetros do quadro.
@group(0) @binding(0) var<storage, read> cameras: array<CameraMatrices>;
// Pool WorldTransform, o registro de desenho de cada entidade (`Renderable`) e a lista de instâncias dos grupos
// (`RenderInstance`): um desenho por grupo (geometria, pipeline); a instância acha o registro pela lista.
@group(1) @binding(0) var<storage, read> worlds: array<WorldTransform>;
@group(1) @binding(1) var<storage, read> renderables: array<Renderable>;
@group(1) @binding(2) var<storage, read> instances: array<RenderInstance>;
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
}

@vertex
fn vs_main(in: VsIn, @builtin(instance_index) instance: u32) -> VsOut {
    var out: VsOut;
    let r = renderables[instances[instance].renderable];
    let w = worlds[r.transformSlot];
    let world = w.world * vec4<f32>(in.position, 1.0);
    out.clip_position = camera_clip(forward_frame.cameraSlot, world);
    out.world_position = world.xyz;
    out.world_normal = w.normal * in.normal;
    out.material_slot = r.materialSlot;
    return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let material = materials[in.material_slot];
    let n = normalize(in.world_normal);
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
        let lit = (BRDF_AMBIENT + n_dot_l * BRDF_DIFFUSE * shadow_factor * caustic) * material.albedo.rgb;
        return vec4<f32>(lit, material.albedo.a);
    }
    return vec4<f32>(lambert_lit(material.albedo.rgb, n_dot_l, shadow_factor), material.albedo.a);
}

// Transmissão da luz pela água no ponto: abaixo da superfície vista pela luz, o mapa de cáusticas (bilinear); acima
// ou fora da água, 1.
fn water_caustic_factor(world_pos: vec3f, light_view_proj: mat4x4f) -> vec3f {
    let lp = light_view_proj * vec4f(world_pos, 1.0);
    let ndc = lp.xyz / max(lp.w, 1e-6);
    let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec3f(1.0); }
    let dims = vec2i(textureDimensions(water_light_depth));
    let t = clamp(vec2i(uv * vec2f(dims)), vec2i(0), dims - 1);
    let sz = length(vec3f(light_view_proj[0].z, light_view_proj[1].z, light_view_proj[2].z));
    let water = textureLoad(water_light_depth, t, 0).x;
    // Viés de 2 cm: a própria superfície e o que a toca não ficam "embaixo".
    if (ndc.z / sz <= water + 0.02) { return vec3f(1.0); }
    let f = uv * vec2f(dims) - 0.5;
    let b = vec2i(floor(f));
    let w = f - floor(f);
    let hi = dims - 1;
    let c00 = textureLoad(caustic_map, clamp(b, vec2i(0), hi), 0).rgb;
    let c10 = textureLoad(caustic_map, clamp(b + vec2i(1, 0), vec2i(0), hi), 0).rgb;
    let c01 = textureLoad(caustic_map, clamp(b + vec2i(0, 1), vec2i(0), hi), 0).rgb;
    let c11 = textureLoad(caustic_map, clamp(b + vec2i(1, 1), vec2i(0), hi), 0).rgb;
    return mix(mix(c00, c10, w.x), mix(c01, c11, w.x), w.y);
}
