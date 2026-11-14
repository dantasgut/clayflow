// Pedido da refração pela malha da superfície dos volumes (spec 039 refeita, D3): os triângulos da superfície da água
// (`field_mesh_vertices`, a malha que o campo extrai a cada quadro), desenhados nas duas faces no mesmo alvo e na mesma
// profundidade do pedido dos transmissivos (teste `less`: fica a interface mais próxima por pixel). A superfície atrás
// do opaco do pixel não é pedida; a face de trás marca o pedido (o raio vê a superfície de dentro). Nenhuma marcha.
// Requer: refraction, cameras, camera_space, view_space, REFRACTION_REQUEST_VALID, REFRACTION_REQUEST_BACK_FACE,
// scene_depth, field_mesh_vertices.

struct RefractionVolumeMeshVarying {
    @builtin(position) clip: vec4f,
    @location(0) world: vec3f,
}

@vertex
fn refraction_volume_mesh_vs(@builtin(vertex_index) i: u32) -> RefractionVolumeMeshVarying {
    let w = i * 4u;
    let p = vec3f(bitcast<f32>(field_mesh_vertices[w]), bitcast<f32>(field_mesh_vertices[w + 1u]),
        bitcast<f32>(field_mesh_vertices[w + 2u]));
    var out: RefractionVolumeMeshVarying;
    out.clip = cameras[refraction.camera_slot].viewProjection * vec4f(p, 1.0);
    out.world = p;
    return out;
}

struct RefractionVolumeMeshOut {
    @location(0) request: vec2u,
}

@fragment
fn refraction_volume_mesh_fs(in: RefractionVolumeMeshVarying, @builtin(front_facing) front: bool)
    -> RefractionVolumeMeshOut {
    let slot = refraction.camera_slot;
    let cam = cameras[slot];
    // O opaco do pixel na frente da superfície: nada a pedir.
    let ndc = textureLoad(scene_depth, vec2i(in.clip.xy), 0);
    if (ndc < 1.0 && in.clip.z >= ndc) { discard; }
    var out: RefractionVolumeMeshOut;
    let marks = select(REFRACTION_REQUEST_VALID | REFRACTION_REQUEST_BACK_FACE, REFRACTION_REQUEST_VALID, front);
    out.request = vec2u(bitcast<u32>(distance(cam.position.xyz, in.world)), marks);
    return out;
}
