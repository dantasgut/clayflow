/**
 * WGSL — Shader de partículas fluidas (fluid_particle).
 *
 * Renderiza PBFParticle / SPHParticle como sphere impostors via instanced draw.
 * Lê posições diretamente do buffer GPU da simulação (zero-copy).
 *
 * Bind Groups:
 *   @group(0) @binding(0) — FrameUniforms  : viewProj + lights + screen (128 bytes)
 *   @group(1) @binding(0) — ObjectUniforms : model mat4x4f [dynamic offset]
 *   @group(2) @binding(0) — particles      : array<vec4f> (stride = 4 × vec4f por partícula)
 *
 * A posição de cada partícula está nos primeiros 3 floats do primeiro vec4f
 * (compatível com PBFParticle.pos.xyz e SPHParticle.pos.xyz).
 *
 * Draw:
 *   vertexCount   = 6  (quad billboard, 2 triângulos)
 *   instanceCount = N  (partículas ativas)
 */
export const FLUID_PARTICLE_SHADER_ID = 'fluid_particle';

export const FLUID_PARTICLE_WGSL = /* wgsl */`

struct FrameUniforms {
    viewProj     : mat4x4f,
    ambientColor : vec4f,    // xyz = color, w = intensity
    dirDirection : vec4f,    // xyz = toward light, w = unused
    dirColor     : vec4f,    // xyz = color, w = intensity
    screen       : vec4f,    // x = width, y = height (pixels)
};

struct ObjectUniforms {
    model : mat4x4f,
};

@group(0) @binding(0) var<uniform>      frame:     FrameUniforms;
@group(1) @binding(0) var<uniform>      obj:       ObjectUniforms;
@group(2) @binding(0) var<storage,read> particles: array<vec4f>;

// PBF/SPH: 4 × vec4f por partícula (64 bytes), pos.xyz em particles[i*4]
const STRIDE = 4u;

// Tamanho do billboard em frações de altura de tela (ajustável via shader customizado)
const HALF_SIZE_NDC = 0.018f;

const QUAD_UV = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
);

struct VertexOut {
    @builtin(position) clip_pos : vec4f,
    @location(0)       uv       : vec2f,
};

@vertex
fn vs_main(
    @builtin(vertex_index)   vi : u32,
    @builtin(instance_index) ii : u32,
) -> VertexOut {
    let base   = ii * STRIDE;
    let pos_ls = particles[base].xyz;
    let pos_ws = (obj.model * vec4f(pos_ls, 1.0)).xyz;

    // Projetar centro da partícula
    let clip_c = frame.viewProj * vec4f(pos_ws, 1.0);

    // Offset em clip space pré-dividido por w (mantém tamanho proporcional à distância)
    let uv     = QUAD_UV[vi];
    let aspect = frame.screen.x / max(frame.screen.y, 1.0);

    var out : VertexOut;
    out.clip_pos = vec4f(
        clip_c.x + uv.x * HALF_SIZE_NDC / aspect * clip_c.w,
        clip_c.y + uv.y * HALF_SIZE_NDC             * clip_c.w,
        clip_c.z,
        clip_c.w,
    );
    out.uv = uv;
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
    // Sphere impostor: descarta pixels fora do círculo
    let d_sq = dot(in.uv, in.uv);
    if (d_sq > 1.0) { discard; }

    // Normal da esfera no espaço de visão (aproximação para iluminação)
    let n = vec3f(in.uv, sqrt(max(0.0, 1.0 - d_sq)));

    // Iluminação Phong simplificada
    let light     = normalize(frame.dirDirection.xyz);
    let diff      = saturate(dot(n, light));
    let ambient   = frame.ambientColor.xyz * frame.ambientColor.w;
    let diffuse   = frame.dirColor.xyz * frame.dirColor.w * diff;

    // Cor padrão: azul fluido
    let base_color = vec3f(0.18, 0.52, 0.92);
    return vec4f(base_color * (ambient + diffuse), 1.0);
}
`;
