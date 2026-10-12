// Desenho forward. Structs `Camera`, `WorldTransform`, `StandardMaterial`, `ForwardFrameParams` e `ShadowMap` gerados
// dos schemas.
@group(0) @binding(0) var<uniform> camera: Camera;
// Pool WorldTransform, indexado pelo slot da entidade (firstInstance do draw).
@group(1) @binding(0) var<storage, read> worlds: array<WorldTransform>;
// Pool uniforme do material: um registro por offset dinâmico (slot do material).
@group(2) @binding(0) var<uniform> material: StandardMaterial;
// Parâmetros do quadro (direção da luz, sombra ligada, slot do mapa de sombra) e o mapa de sombra da luz.
@group(3) @binding(0) var<uniform> forward_frame: ForwardFrameParams;
@group(3) @binding(1) var shadow_map: texture_depth_2d;
@group(3) @binding(2) var shadow_sampler: sampler_comparison;
@group(3) @binding(3) var<storage, read> shadow_maps: array<ShadowMap>;

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
    let l = normalize(-forward_frame.lightDir.xyz);
    let n_dot_l = lambert_diffuse(n, l);
    let sm = shadow_maps[forward_frame.shadowSlot];
    let shadow_factor = sample_shadow_pcf(
        shadow_map, shadow_sampler, sm.lightViewProj, in.world_position, sm.bias, forward_frame.shadowEnabled, n_dot_l,
    );
    return vec4<f32>(lambert_lit(material.albedo.rgb, n_dot_l, shadow_factor), material.albedo.a);
}
