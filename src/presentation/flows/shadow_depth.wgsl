struct ShadowParams {
    lightViewProj: mat4x4<f32>,
}

struct Transform {
    position: vec4<f32>,
    rotation: vec4<f32>,
    scale: vec4<f32>,
    model: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> shadow: ShadowParams;
@group(1) @binding(0) var<uniform> transform: Transform;

struct VsIn {
    @location(0) position: vec3<f32>,
}

@vertex
fn vs_main(in: VsIn) -> @builtin(position) vec4<f32> {
    let world = transform.model * vec4<f32>(in.position, 1.0);
    return shadow.lightViewProj * world;
}
