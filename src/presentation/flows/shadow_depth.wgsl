// Profundidade do mapa de sombra. Structs `ShadowDepthParams` e `WorldTransform` gerados dos schemas.
@group(0) @binding(0) var<uniform> shadow: ShadowDepthParams;
// Pool WorldTransform, indexado pelo slot da entidade (firstInstance do draw).
@group(1) @binding(0) var<storage, read> worlds: array<WorldTransform>;

struct VsIn {
    @location(0) position: vec3<f32>,
}

@vertex
fn vs_main(in: VsIn, @builtin(instance_index) slot: u32) -> @builtin(position) vec4<f32> {
    let world = worlds[slot].world * vec4<f32>(in.position, 1.0);
    return shadow.lightViewProj * world;
}
