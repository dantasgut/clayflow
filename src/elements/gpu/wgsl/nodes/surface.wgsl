// Nó de saída do ponto `material` (spec 031): monta os parâmetros de superfície. As entradas sem ligação usam as
// constantes do material da entidade (`m`) — o grafo sem ligações reproduz a função pronta.
// Requer: material_point_types.

fn node_output_surface_params(
    base_color: vec3f,
    alpha: f32,
    roughness: f32,
    metallic: f32,
    emissive: vec3f,
) -> SurfaceParams {
    return SurfaceParams(vec4f(base_color, alpha), roughness, metallic, emissive);
}
