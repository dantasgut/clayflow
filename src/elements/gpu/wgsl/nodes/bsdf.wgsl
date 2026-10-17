// Nós de espalhamento (spec 011, R5): cada um devolve um fechamento com um lobo, de peso 1. As entradas sem ligação
// usam o valor do nó (parâmetro de mesmo nome); a validação das faixas é a dos construtores (`clamp`), porque os valores
// podem vir de outros nós.
// Requer: closure.

fn node_bsdf_diffuse(color: vec3f, roughness: f32) -> Closure {
    return closure_diffuse(color, roughness);
}

fn node_bsdf_conductor(color: vec3f, edge_tint: vec3f, roughness: f32, anisotropy: f32, tangent: vec3f) -> Closure {
    return closure_conductor(color, edge_tint, roughness, anisotropy, tangent);
}

fn node_bsdf_dielectric(ior: f32, tint: vec3f, roughness: f32, anisotropy: f32, tangent: vec3f) -> Closure {
    return closure_dielectric(ior, tint, roughness, anisotropy, tangent);
}

fn node_bsdf_transmission(ior: f32, color: vec3f, depth: f32, abbe: f32, roughness: f32) -> Closure {
    return closure_transmission(ior, color, depth, abbe, roughness);
}

fn node_bsdf_translucent(color: vec3f) -> Closure {
    return closure_translucent(color);
}

fn node_bsdf_sheen(color: vec3f, roughness: f32) -> Closure {
    return closure_sheen(color, roughness);
}

fn node_bsdf_subsurface(color: vec3f, radius: vec3f) -> Closure {
    return closure_subsurface(color, radius);
}

fn node_bsdf_emission(color: vec3f, luminance: f32) -> Closure {
    return closure_emission(color, luminance);
}
