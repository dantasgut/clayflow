// Função pronta do ponto `camera` (spec 009): vista pela inversa rígida da matriz de mundo e projeção perspectiva ou
// ortográfica (a do estágio de câmera). Uma `CameraFunction` toma o lugar deste módulo com a mesma assinatura:
//   fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: CameraFnParams, time: f32) -> CameraOut
// e, opcional, a projeção de um ponto da vista para o clip (projeções não lineares, aplicada no desenho):
//   fn camera_project(view_pos: vec3f, data: CameraFnParams) -> vec4f
// O carregador `camera_fn_params(slot)` lê o registro tipado da função no pool da forma dela (spec 031); a pronta não
// tem.
// Requer: struct Camera; camera_point_types; camera.

struct CameraFnParams {
    _unused: u32,
}

fn camera_fn_params(slot: u32) -> CameraFnParams {
    return CameraFnParams(0u);
}

fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: CameraFnParams, time: f32) -> CameraOut {
    var out: CameraOut;
    out.projection = camera_projection(c.projection, c.fov, c.orthoHeight, aspect, c.near, c.far);
    out.view = camera_view(world);
    return out;
}
