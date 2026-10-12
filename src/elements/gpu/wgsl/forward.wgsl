// Desenho forward. Structs `Camera`, `WorldTransform`, `StandardMaterial` e `ForwardShadowParams` gerados dos schemas.
@group(0) @binding(0) var<uniform> camera: Camera;
// Pool WorldTransform, indexado pelo slot da entidade (firstInstance do draw).
@group(1) @binding(0) var<storage, read> worlds: array<WorldTransform>;
@group(2) @binding(0) var<uniform> material: StandardMaterial;
@group(3) @binding(0) var<uniform> shadow: ForwardShadowParams;
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
fn vs_main(in: VsIn, @builtin(instance_index) slot: u32) -> VsOut {
    var out: VsOut;
    let w = worlds[slot];
    let world = w.world * vec4<f32>(in.position, 1.0);
    out.clip_position = camera.viewProjection * world;
    out.world_position = world.xyz;
    out.world_normal = w.normal * in.normal;
    return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let n = normalize(in.world_normal);
    let l = normalize(-shadow.lightDir.xyz);
    let n_dot_l = lambert_diffuse(n, l);
    let shadow_factor = sample_shadow_pcf(
        shadow_map, shadow_sampler, shadow.lightViewProj, in.world_position, shadow.bias, shadow.enabled, n_dot_l,
    );
    return vec4<f32>(lambert_lit(material.albedo.rgb, n_dot_l, shadow_factor), material.albedo.a);
}
