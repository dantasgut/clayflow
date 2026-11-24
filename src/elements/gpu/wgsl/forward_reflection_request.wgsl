// Pedido de reflexo (spec 011, T114): depois dos opacos, os que têm lobo especular ou verniz desenhados de novo numa
// profundidade própria (a mesma do pedido da refração; teste `less`) marcam os pixels em que o lobo é liso
// (`closure_reflected` > 0: rugosidade abaixo de `CLOSURE_MIRROR_ROUGH`) — a distância até a superfície ao longo do raio
// da câmera, as marcas (`REFRACTION_REQUEST_REFLECT`), a direção refletida pela normal do lobo (a do relevo, a da casca
// do verniz) e a normal da face, em coordenadas octaédricas; e, no alvo `reflectance`, o peso do lobo: o que ele
// devolve a quem vê por unidade de radiância que chega por essa direção, com a névoa até o ponto. O traçado da
// refração parte dali (`refraction_chain_roots_main`) e a composição soma radiância × peso à cor do desenho. Onde o
// lobo é áspero, nenhum pedido (nenhum raio): fica a luz indireta da cena — também no lobo anisotrópico de eixo largo
// áspero (o metal escovado: `closure_base_mirror`). Atrás de outro opaco, nenhum (a profundidade
// dos opacos, com a folga da inclinação da superfície no pixel: com MSAA ela é a da amostra 0, não a do centro).
// Requer: forward (vértice, câmeras, `forward_surface`); `view_space`; `closure_eval`; `scene_fog`; `scene_depth`.

struct ReflectionRequestOut {
    @location(0) request: vec4u,
    @location(1) reflectance: vec4f,
}

/** A direção unitária `v` em coordenadas octaédricas de 16 + 16 bits. */
fn reflection_request_oct(v: vec3f) -> u32 {
    let n = v / (abs(v.x) + abs(v.y) + abs(v.z));
    var e = n.xy;
    if (n.z < 0.0) { e = (1.0 - abs(n.yx)) * select(vec2f(-1.0), vec2f(1.0), n.xy >= vec2f(0.0)); }
    let q = vec2u(round(clamp(e * 0.5 + 0.5, vec2f(0.0), vec2f(1.0)) * 65535.0));
    return q.x | (q.y << 16u);
}

@fragment
fn fs_reflection_request(in: VsOut, @builtin(front_facing) front: bool) -> ReflectionRequestOut {
    let surface = forward_surface(in, front);
    let slope = fwidth(in.clip_position.z);
    // A normal da face (do triângulo, não a interpolada): o raio parte por fora da malha de verdade.
    let facet = cross(dpdx(in.world_position), dpdy(in.world_position));
    let hidden = in.clip_position.z > textureLoad(scene_depth, vec2i(in.clip_position.xy), 0) + 2.0 * slope + 1e-6;
    let cam = cameras[forward_frame.cameraSlot];
    let v = forward_view_dir(cam, in.world_position);
    let weight = closure_reflected(surface.c, surface.n, v) * scene_fog(in.world_position).transmittance;
    if (hidden || all(weight <= vec3f(1e-4))) { discard; }
    // A direção refletida fica do lado de fora da face (a normal interpolada ou a do relevo podem levá-la para dentro:
    // o raio acertava a própria malha, e o reflexo rasante saía preto).
    let face = select(surface.n, normalize(facet) * sign(dot(facet, v)), dot(facet, facet) > 0.0 && dot(facet, v) != 0.0);
    let mirrored = closure_reflected_dir(surface.c, surface.n, v);
    let dir = normalize(mirrored + face * max(0.02 - dot(mirrored, face), 0.0));
    let to = in.world_position - cam.position.xyz;
    let ahead = dot(to, -normalize(cam.inverseView[2].xyz));
    let d = select(length(to), ahead, is_orthographic(cam.projection));
    var out: ReflectionRequestOut;
    out.request = vec4u(bitcast<u32>(d), REFRACTION_REQUEST_VALID | REFRACTION_REQUEST_REFLECT,
        reflection_request_oct(dir), reflection_request_oct(face));
    out.reflectance = vec4f(weight, 1.0);
    return out;
}
