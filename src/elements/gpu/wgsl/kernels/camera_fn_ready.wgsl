// Função pronta do ponto `camera` (spec 009): vista pela inversa rígida da matriz de mundo e projeção perspectiva ou
// ortográfica (a do estágio de câmera). Uma `CameraFunction` toma o lugar deste módulo com a mesma assinatura:
//   fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: CameraFnParams, time: f32) -> CameraOut
// e, opcional, a projeção de um ponto da vista para o clip (projeções não lineares, aplicada no desenho):
//   fn camera_project(view_pos: vec3f, data: CameraFnParams) -> vec4f
// Requer: structs Camera, CameraFnRecord; camera_point_types; camera.

struct CameraFnParams {
    _unused: u32,
}

fn camera_fn_params(r: CameraFnRecord) -> CameraFnParams {
    return CameraFnParams(0u);
}

fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: CameraFnParams, time: f32) -> CameraOut {
    var out: CameraOut;
    if (c.projection == 1u) {
        out.projection = camera_orthographic(c.orthoHeight, aspect, c.near, c.far);
    } else {
        out.projection = camera_perspective(c.fov, aspect, c.near, c.far);
    }
    out.view = camera_view(world);
    return out;
}
