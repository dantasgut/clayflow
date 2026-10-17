// Transmissão da luz pela água (spec 017; contribuição do `WaterSurface` ao ponto de cena `light_transmission`, por luz,
// spec 011): o fator da luz `light` no ponto `p`. As cáusticas são da luz cuja vista a água produziu (a que projeta
// sombra, `lights[light].castShadow`): com elas ligadas no estado da superfície (`water_state.caustics`, 1 quando a
// vista da luz foi produzida no quadro), abaixo da superfície vista pela luz o fator é o mapa de cáusticas; as outras
// luzes e a ambiente (`NONE`) passam inteiras. Structs `WaterState`, `WaterLightMatrix` e `Light` gerados dos schemas;
// recursos declarados em `water/shaders.ts`.

fn light_transmission(light: u32, p: vec3f) -> vec3f {
    if (water_state.caustics == 0u || light == NONE || lights[light].castShadow == 0u) { return vec3f(1.0); }
    return water_caustic_factor(p, water_light_matrix.viewProj);
}

// Transmissão da luz pela água no ponto: abaixo da superfície vista pela luz, o mapa de cáusticas (bilinear); acima
// ou fora da água, 1.
fn water_caustic_factor(world_pos: vec3f, light_view_proj: mat4x4f) -> vec3f {
    let lp = light_view_proj * vec4f(world_pos, 1.0);
    let ndc = lp.xyz / max(lp.w, 1e-6);
    let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec3f(1.0); }
    let dims = vec2i(textureDimensions(water_light_depth));
    let sz = length(vec3f(light_view_proj[0].z, light_view_proj[1].z, light_view_proj[2].z));
    let depth = ndc.z / sz;
    let f = uv * vec2f(dims) - 0.5;
    let b = vec2i(floor(f));
    let w = f - floor(f);
    let hi = dims - 1;
    // Cobertura da água sobre o ponto, interpolada entre os 4 texels da vista da luz (como o PCF da sombra): o
    // ponto está embaixo da água no texel cuja superfície fica acima dele (viés de 2 cm: a própria superfície e o que
    // a toca não ficam "embaixo"). Sem a interpolação, uma gota isolada marcava o fundo com o quadrado do seu texel.
    let t00 = clamp(b, vec2i(0), hi);
    let t10 = clamp(b + vec2i(1, 0), vec2i(0), hi);
    let t01 = clamp(b + vec2i(0, 1), vec2i(0), hi);
    let t11 = clamp(b + vec2i(1, 1), vec2i(0), hi);
    let u00 = select(0.0, 1.0, depth > textureLoad(water_light_depth, t00, 0).x + 0.02);
    let u10 = select(0.0, 1.0, depth > textureLoad(water_light_depth, t10, 0).x + 0.02);
    let u01 = select(0.0, 1.0, depth > textureLoad(water_light_depth, t01, 0).x + 0.02);
    let u11 = select(0.0, 1.0, depth > textureLoad(water_light_depth, t11, 0).x + 0.02);
    let coverage = mix(mix(u00, u10, w.x), mix(u01, u11, w.x), w.y);
    if (coverage <= 0.0) { return vec3f(1.0); }
    let c00 = textureLoad(caustic_map, t00, 0).rgb;
    let c10 = textureLoad(caustic_map, t10, 0).rgb;
    let c01 = textureLoad(caustic_map, t01, 0).rgb;
    let c11 = textureLoad(caustic_map, t11, 0).rgb;
    let caustic = mix(mix(c00, c10, w.x), mix(c01, c11, w.x), w.y);
    return mix(vec3f(1.0), caustic, coverage);
}
