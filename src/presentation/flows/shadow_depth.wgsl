// Profundidade do mapa de sombra. Structs `ShadowDepthParams`, `ShadowMap` e `WorldTransform` gerados dos schemas.
// A matriz da luz vem do pool `ShadowMap`, no slot do mapa que projeta (`casterSlot`).
@group(0) @binding(0) var<uniform> shadow: ShadowDepthParams;
@group(0) @binding(1) var<storage, read> shadow_maps: array<ShadowMap>;
// Pool WorldTransform, indexado pelo slot da entidade (firstInstance do draw).
@group(1) @binding(0) var<storage, read> worlds: array<WorldTransform>;

struct VsIn {
    @location(0) position: vec3<f32>,
}

@vertex
fn vs_main(in: VsIn, @builtin(instance_index) slot: u32) -> @builtin(position) vec4<f32> {
    let world = worlds[slot].world * vec4<f32>(in.position, 1.0);
    return shadow_maps[shadow.casterSlot].lightViewProj * world;
}
