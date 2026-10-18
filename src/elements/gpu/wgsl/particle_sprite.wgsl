// Sprites de partículas (spec 008): um quad virado para a câmera por partícula, com a posição lida direto do pool do
// corpo (`array<vec4f>`, stride e deslocamento do campo `pos` em `ParticleDrawParams`) pelo índice da instância — sem
// cópia para vertex buffer. Desenhado como esfera impostora (normal reconstruída no fragmento) iluminada pelo mesmo
// modelo do forward (ponto `scene_lighting`, spec 011: o fechamento da cor do material sobre a normal do impostor). Structs `CameraMatrices`, `PointSpriteMaterial`, `ParticleFrameParams`
// e `ParticleDrawParams` gerados dos schemas; recursos declarados pelo módulo (spec 031): o pool do corpo (o do
// pipeline), o dos materiais de sprite e a região do corpo desenhado (offset dinâmico).

struct SpriteOut {
    @builtin(position) clip_position: vec4f,
    @location(0) corner: vec2f,
    @location(1) @interpolate(flat) material_slot: u32,
    @location(2) center: vec3f,
}

// Cantos do quad (dois triângulos).
fn sprite_corner(v: u32) -> vec2f {
    var corners = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
        vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
    );
    return corners[v % 6u];
}

@vertex
fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> SpriteOut {
    var out: SpriteOut;
    let slot = particle_draw.first + instance;
    let center = particles[slot * particle_draw.strideVec4 + particle_draw.posOffsetVec4].xyz;
    let material = materials[particle_draw.materialSlot];
    let camera = cameras[particle_frame.cameraSlot];
    let corner = sprite_corner(vertex);
    out.corner = corner;
    out.material_slot = particle_draw.materialSlot;
    out.center = center;
    // Posição não finita (explosão numérica): o quad sai do volume de recorte e não é desenhado.
    if (!all(abs(center) < vec3f(1e30))) {
        out.clip_position = vec4f(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    let view = camera.view * vec4f(center, 1.0);
    out.clip_position = camera.projection * vec4f(view.xy + corner * material.radius, view.z, 1.0);
    return out;
}

@fragment
fn fs_main(in: SpriteOut) -> @location(0) vec4f {
    let r2 = dot(in.corner, in.corner);
    if (r2 > 1.0) { discard; }
    let material = materials[in.material_slot];
    let camera = cameras[particle_frame.cameraSlot];
    // Normal da esfera impostora (espaço da câmera → mundo) e o ponto na superfície dela.
    let n_view = vec3f(in.corner, sqrt(1.0 - r2));
    let n = normalize(transpose(mat3x3f(camera.view[0].xyz, camera.view[1].xyz, camera.view[2].xyz)) * n_view);
    let p = in.center + n * material.radius;
    let v = normalize(camera.position.xyz - p);
    let c = closure_from_params(SurfaceParams(material.color, 0.5, 0.0, vec3f(0.0)));
    let fog = scene_fog(p);
    return vec4f(scene_lighting(c, p, n, v) * fog.a + fog.rgb, material.color.a);
}
