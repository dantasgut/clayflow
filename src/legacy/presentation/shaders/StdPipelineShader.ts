/**
 * WGSL — Pipeline padrão (std_pipeline_hash).
 *
 * Bind Groups:
 *   @group(0) @binding(0) — FrameUniforms  : viewProj + ambient + directional light (112 bytes)
 *   @group(1) @binding(0) — ObjectUniforms : model (mat4x4f) [dynamic offset]
 *   @group(2) @binding(0) — MaterialData   : color, emissive, roughness, metallic
 *
 * Vertex layout: position(vec3) | normal(vec3) | uv(vec2)  → 8 floats, interleaved
 *
 * FrameUniforms layout (112 bytes):
 *   offset  0 : viewProj      mat4x4f  (64 bytes)
 *   offset 64 : ambientColor  vec4f    (xyz = color, w = intensity)
 *   offset 80 : dirDirection  vec4f    (xyz = world direction toward light, w = unused)
 *   offset 96 : dirColor      vec4f    (xyz = color, w = intensity)
 */
export const STD_PIPELINE_WGSL = /* wgsl */`

struct FrameUniforms {
    viewProj     : mat4x4f,
    ambientColor : vec4f,   // xyz = color, w = intensity
    dirDirection : vec4f,   // xyz = world direction toward light source (normalized), w = unused
    dirColor     : vec4f,   // xyz = color, w = intensity
};

struct ObjectUniforms {
    model : mat4x4f,
};

struct MaterialUniforms {
    color     : vec4f,
    emissive  : vec4f,   // xyz = emissive, w = unused padding
    roughness : f32,
    metallic  : f32,
    _pad0     : f32,
    _pad1     : f32,
};

@group(0) @binding(0) var<uniform> frame    : FrameUniforms;
@group(1) @binding(0) var<uniform> obj      : ObjectUniforms;
@group(2) @binding(0) var<uniform> material : MaterialUniforms;

struct VertexIn {
    @location(0) position : vec3f,
    @location(1) normal   : vec3f,
    @location(2) uv       : vec2f,
};

struct VertexOut {
    @builtin(position) clip_pos     : vec4f,
    @location(0)       world_normal : vec3f,
    @location(1)       uv          : vec2f,
};

@vertex
fn vs_main(in: VertexIn) -> VertexOut {
    let world_pos    = obj.model * vec4f(in.position, 1.0);
    var out          : VertexOut;
    out.clip_pos     = frame.viewProj * world_pos;
    out.world_normal = normalize((obj.model * vec4f(in.normal, 0.0)).xyz);
    out.uv           = in.uv;
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
    let n = normalize(in.world_normal);

    // Luz ambiente
    let ambient = frame.ambientColor.rgb * frame.ambientColor.w;

    // Luz direcional (Lambertian)
    let ndotl   = max(dot(n, frame.dirDirection.xyz), 0.0);
    let diffuse = frame.dirColor.rgb * frame.dirColor.w * ndotl * (1.0 - material.roughness * 0.5);

    let lit = material.color.rgb * (ambient + diffuse) + material.emissive.xyz;
    return vec4f(lit, material.color.a);
}
`;

/** ID do pipeline padrão de fills (triangle-list). */
export const STD_PIPELINE_ID      = 'std_pipeline_hash|triangle-list';
/** ID do pipeline de wireframe fino (line-list, mesma geometria). */
export const STD_WIREFRAME_ID     = 'std_pipeline_hash|line-list';
/** ID do layout de bind group do material — criado em Material.allocateResource(). */
export const STD_MATERIAL_LAYOUT  = 'std_pipeline_hash';
