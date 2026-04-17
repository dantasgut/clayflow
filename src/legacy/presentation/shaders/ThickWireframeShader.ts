/**
 * WGSL — Pipeline de wireframe espesso via vertex pulling (thick-wireframe).
 *
 * Bind Groups:
 *   @group(0) @binding(0) — FrameUniforms    : viewProj + luzes + screen (128 bytes)
 *   @group(1) @binding(0) — ObjectUniforms   : model mat4x4f [dynamic offset]
 *   @group(2) @binding(0) — WireframeUniforms: color vec4f + lineWidth f32 + padding
 *   @group(3) @binding(0) — wfPos            : array<f32>  — posições wireframe (3 floats/vértice)
 *   @group(3) @binding(1) — wfEdges          : array<u32>  — arestas wireframe  (2 u32/aresta)
 *
 * Vertex pulling: nenhum vertex buffer vinculado.
 * Draw = edgeCount × 6 (cada aresta → 2 triângulos de quad).
 *
 * As posições e arestas são definidas explicitamente pela Geometry — nunca derivadas
 * da triangulação — portanto nenhuma aresta diagonal interna é renderizada.
 *
 * Antialiasing: `side` interpolado → fwidth + smoothstep na borda do quad.
 */
export const THICK_WIREFRAME_WGSL = /* wgsl */`

struct FrameUniforms {
    viewProj     : mat4x4f,
    ambientColor : vec4f,
    dirDirection : vec4f,
    dirColor     : vec4f,
    screen       : vec4f,   // x = largura, y = altura em pixels
};

struct ObjectUniforms {
    model : mat4x4f,
};

struct WireframeUniforms {
    color     : vec4f,
    lineWidth : f32,
    _pad0     : f32,
    _pad1     : f32,
    _pad2     : f32,
};

@group(0) @binding(0) var<uniform>       frame   : FrameUniforms;
@group(1) @binding(0) var<uniform>       obj     : ObjectUniforms;
@group(2) @binding(0) var<uniform>       wf      : WireframeUniforms;
@group(3) @binding(0) var<storage, read> wfPos   : array<f32>;
@group(3) @binding(1) var<storage, read> wfEdges : array<u32>;

struct VertexOut {
    @builtin(position) clip_pos : vec4f,
    @location(0)       side     : f32,
};

fn readPos(idx: u32) -> vec3f {
    let base = idx * 3u;
    return vec3f(wfPos[base], wfPos[base + 1u], wfPos[base + 2u]);
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOut {
    // 6 vértices por aresta (2 triângulos de quad)
    let edgeIdx  = vi / 6u;
    let quadVert = vi % 6u;

    let iA = wfEdges[edgeIdx * 2u];
    let iB = wfEdges[edgeIdx * 2u + 1u];

    // Mapeamento do quad:
    // v0: posA,-1 | v1: posA,+1 | v2: posB,+1
    // v3: posA,-1 | v4: posB,+1 | v5: posB,-1
    let useB = (quadVert == 2u || quadVert == 4u || quadVert == 5u);
    let side = select(-1.0, 1.0, quadVert == 1u || quadVert == 2u || quadVert == 4u);

    let posA = readPos(iA);
    let posB = readPos(iB);

    let mvp   = frame.viewProj * obj.model;
    let clipA = mvp * vec4f(posA, 1.0);
    let clipB = mvp * vec4f(posB, 1.0);
    let clip  = select(clipA, clipB, useB);

    // Direção da aresta em pixels de tela
    let ndcA    = clipA.xy / clipA.w;
    let ndcB    = clipB.xy / clipB.w;
    let screenA = ndcA * frame.screen.xy * 0.5;
    let screenB = ndcB * frame.screen.xy * 0.5;
    let edgePx  = screenB - screenA;
    let edgeLen = length(edgePx);
    let edgeDir = select(vec2f(1.0, 0.0), edgePx / edgeLen, edgeLen > 0.0001);

    // Perpendicular em pixels → NDC → clip space
    let perpPx  = vec2f(-edgeDir.y, edgeDir.x);
    let perpNDC = perpPx / (frame.screen.xy * 0.5);

    let halfW     = wf.lineWidth * 0.5;
    let clipFinal = vec4f(
        clip.xy + perpNDC * side * halfW * clip.w,
        clip.z,
        clip.w,
    );

    var out: VertexOut;
    out.clip_pos = clipFinal;
    out.side     = side;
    return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
    let dist  = abs(in.side);
    let fw    = fwidth(dist);
    let alpha = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, dist);
    return vec4f(wf.color.rgb, wf.color.a * alpha);
}
`;

/** ID do shader/layout de wireframe espesso. */
export const THICK_WIREFRAME_ID = 'thick-wireframe';
