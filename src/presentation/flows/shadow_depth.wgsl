// Profundidade do mapa de sombra. Structs `ShadowDepthParams`, `ShadowMatrix`, `WorldTransform` e `ShadowInstance`
// gerados dos schemas.
// A matriz da luz vem do pool `ShadowMatrix` (produzida na GPU pelo estágio da matriz de sombra), no slot do mapa que
// projeta (`casterSlot`).
@group(0) @binding(0) var<uniform> shadow: ShadowDepthParams;
@group(0) @binding(1) var<storage, read> shadow_matrices: array<ShadowMatrix>;
// Pool WorldTransform e a lista de instâncias dos grupos (um desenho por geometria e orientação): a instância acha o
// slot da entidade no pool pela lista.
@group(1) @binding(0) var<storage, read> worlds: array<WorldTransform>;
@group(1) @binding(1) var<storage, read> instances: array<ShadowInstance>;

struct VsIn {
    @location(0) position: vec3<f32>,
}

@vertex
fn vs_main(in: VsIn, @builtin(instance_index) instance: u32) -> @builtin(position) vec4<f32> {
    let world = worlds[instances[instance].world].world * vec4<f32>(in.position, 1.0);
    return shadow_matrices[shadow.casterSlot].lightViewProj * world;
}
