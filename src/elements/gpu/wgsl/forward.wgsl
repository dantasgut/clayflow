struct Camera {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    viewProjection: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
    fov: f32,
    aspect: f32,
}

struct Transform {
    position: vec4<f32>,
    rotation: vec4<f32>,
    scale: vec4<f32>,
    model: mat4x4<f32>,
}

struct StandardMaterial {
    albedo: vec4<f32>,
    roughness: f32,
    metallic: f32,
    _pad0: f32,
    _pad1: f32,
}

struct ShadowParams {
    lightViewProj: mat4x4<f32>,
    lightDir: vec4<f32>,
    bias: f32,
    enabled: f32,
    _pad0: f32,
    _pad1: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var<uniform> transform: Transform;
@group(2) @binding(0) var<uniform> material: StandardMaterial;
@group(3) @binding(0) var<uniform> shadow: ShadowParams;
@group(3) @binding(1) var shadow_map: texture_depth_2d;
@group(3) @binding(2) var shadow_sampler: sampler_comparison;

struct VsIn {
    @location(0) position: vec3<f32>,
    @location(1) normal:   vec3<f32>,
    @location(2) uv:       vec2<f32>,
}

struct VsOut {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_normal: vec3<f32>,
    @location(1) world_position: vec3<f32>,
}

@vertex
fn vs_main(in: VsIn) -> VsOut {
    var out: VsOut;
    let world = transform.model * vec4<f32>(in.position, 1.0);
    out.clip_position = camera.viewProjection * world;
    out.world_position = world.xyz;
    out.world_normal = (transform.model * vec4<f32>(in.normal, 0.0)).xyz;
    return out;
}

fn sample_shadow(world_pos: vec3<f32>, n_dot_l: f32) -> f32 {
    let lp = shadow.lightViewProj * vec4<f32>(world_pos, 1.0);
    let ndc = lp.xyz / max(lp.w, 1e-6);
    let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    let bias = max(shadow.bias * (1.0 - n_dot_l), shadow.bias * 0.1);
    let ref_depth = ndc.z - bias;
    let texel = vec2<f32>(1.0) / vec2<f32>(textureDimensions(shadow_map, 0));
    // textureSampleCompareLevel não exige uniform control flow.
    // Always-execute PCF 3x3 + máscara fora-dos-bounds via select (sem branch divergente).
    var sum = 0.0;
    for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
        for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
            sum = sum + textureSampleCompareLevel(
                shadow_map, shadow_sampler,
                uv + vec2<f32>(f32(dx), f32(dy)) * texel,
                ref_depth,
            );
        }
    }
    let pcf = sum / 9.0;
    let in_bounds = f32(ndc.x >= -1.0 && ndc.x <= 1.0 && ndc.y >= -1.0 && ndc.y <= 1.0 && ndc.z >= 0.0 && ndc.z <= 1.0);
    let enabled = step(0.5, shadow.enabled);
    return mix(1.0, mix(1.0, pcf, in_bounds), enabled);
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let n = normalize(in.world_normal);
    let l = normalize(-shadow.lightDir.xyz);
    let n_dot_l = max(dot(n, l), 0.0);
    let shadow_factor = sample_shadow(in.world_position, n_dot_l);
    let ambient = 0.18;
    let lit = (ambient + n_dot_l * 0.82 * shadow_factor) * material.albedo.rgb;
    return vec4<f32>(lit, material.albedo.a);
}
