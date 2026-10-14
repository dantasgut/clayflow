// Sprites nos vértices de uma geometria (spec 008, `PointSpriteMaterial` no forward): um quad virado para a câmera por
// vértice, com a posição lida do vertex buffer da geometria como storage (8 floats por vértice: posição, normal, uv) —
// geometria da CPU ou escrita por um estágio (`PointCloudGeometry`). `vertex_index / 6` é o vértice; a instância é a
// entidade do grupo (registro `Renderable`: matriz de mundo e material). Mesmos grupos 0 e 1 do forward.
@group(0) @binding(0) var<storage, read> cameras: array<CameraMatrices>;
@group(1) @binding(0) var<storage, read> worlds: array<WorldTransform>;
@group(1) @binding(1) var<storage, read> renderables: array<Renderable>;
@group(1) @binding(2) var<storage, read> instances: array<RenderInstance>;
@group(2) @binding(0) var<storage, read> materials: array<PointSpriteMaterial>;
@group(3) @binding(0) var<uniform> forward_frame: ForwardFrameParams;
@group(3) @binding(5) var<storage, read> lights: array<Light>;
// Vértices da geometria do pipeline (binding privado por geometria).
@group(3) @binding(6) var<storage, read> point_vertices: array<f32>;

// Direção da luz sem luz que ilumina, a mesma do forward.
const POINT_DEFAULT_LIGHT_DIR = vec3f(0.4, -1.0, 0.6);

struct PointOut {
    @builtin(position) clip_position: vec4f,
    @location(0) corner: vec2f,
    @location(1) @interpolate(flat) material_slot: u32,
}

@vertex
fn vs_main(@builtin(vertex_index) index: u32, @builtin(instance_index) instance: u32) -> PointOut {
    var out: PointOut;
    var corners = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
        vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
    );
    let corner = corners[index % 6u];
    let v = (index / 6u) * 8u;
    let r = renderables[instances[instance].renderable];
    let material = materials[r.materialSlot];
    let camera = cameras[forward_frame.cameraSlot];
    let local = vec3f(point_vertices[v], point_vertices[v + 1u], point_vertices[v + 2u]);
    out.corner = corner;
    out.material_slot = r.materialSlot;
    if (!all(abs(local) < vec3f(1e30))) {
        out.clip_position = vec4f(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    let view = camera.view * worlds[r.transformSlot].world * vec4f(local, 1.0);
    out.clip_position = camera.projection * vec4f(view.xy + corner * material.radius, view.z, 1.0);
    return out;
}

@fragment
fn fs_main(in: PointOut) -> @location(0) vec4f {
    let r2 = dot(in.corner, in.corner);
    if (r2 > 1.0) { discard; }
    let material = materials[in.material_slot];
    let camera = cameras[forward_frame.cameraSlot];
    let n = vec3f(in.corner, sqrt(1.0 - r2));
    var light_dir = POINT_DEFAULT_LIGHT_DIR;
    if (forward_frame.lightSlot != 0xFFFFFFFFu) {
        light_dir = lights[forward_frame.lightSlot].direction.xyz;
    }
    let l = normalize((camera.view * vec4f(-light_dir, 0.0)).xyz);
    return vec4f(lambert_lit(material.color.rgb, lambert_diffuse(n, l), 1.0), material.color.a);
}
