// Luz que entra nos materiais com subsuperfície (spec 011, T113): depois do passe principal, as entidades com o lobo de
// subsuperfície desenhadas de novo, sem amostras e com profundidade própria (teste `less`), guardam por pixel o que a
// difusão precisa — `irradiance`: a luz que o perfil vai espalhar, a irradiância difusa que chega pela frente das luzes
// da cena (a direta, com a sombra, e o hemisfério, pela resposta de um difuso branco: E/π; a rebatida fica no ponto — é
// lisa na escala do perfil, e medi-la de novo aqui custava 1,5 ms num quadro de 1440 × 960 com metade da tela coberta)
// mais a que atravessa o corpo vinda das luzes do outro lado (ponto de cena `scene_transmitted_lighting`), esta sobre o albedo (a saída multiplica por ele;
// a que atravessa não), e 1 no alfa; `exit`: o que do lobo sai para quem vê por unidade dessa luz (o peso, o albedo e as
// camadas de cima: `closure_subsurface_exit`); `local`: a luz da frente pela saída — o que o passe principal já
// desenhou no ponto — e, no alfa, a distância do ponto à frente da câmera. Atrás de um opaco (a profundidade da cena,
// com ou sem amostras: a 0) nada é guardado. O especular fica fora: é do passe principal.
// Requer: forward (vértice, superfície do fragmento); subsurface; scene_transmitted_lighting; scene_depth.

struct SubsurfaceIrradianceOut {
    @location(0) irradiance: vec4<f32>,
    @location(1) local: vec4<f32>,
    @location(2) exit: vec4<f32>,
}

@fragment
fn fs_subsurface_irradiance(in: VsOut, @builtin(front_facing) front: bool) -> SubsurfaceIrradianceOut {
    let surface = forward_surface(in, front);
    let slope = fwidth(in.clip_position.z);
    if (in.clip_position.z > textureLoad(scene_depth, vec2i(in.clip_position.xy), 0) + 2.0 * slope + 1e-6) { discard; }
    let c = surface.c;
    let cam = cameras[forward_frame.cameraSlot];
    let v = forward_view_dir(cam, in.world_position);
    // O difuso branco com a normal dos lobos de base: a resposta dele às luzes é a irradiância sobre π.
    var probe = closure_diffuse(vec3f(1.0), 0.0);
    probe.normal = c.normal;
    let arriving = min(scene_direct_lighting(probe, in.world_position, surface.n, v), vec3f(60000.0));
    let through = scene_transmitted_lighting(c, in.world_position, surface.n, v);
    let exit = closure_subsurface_exit(c, surface.n, v);
    let ahead = dot(in.world_position - cam.position.xyz, -normalize(cam.inverseView[2].xyz));
    var out: SubsurfaceIrradianceOut;
    out.irradiance = vec4f(min(arriving + through / max(c.subsurface_color, vec3f(SUBSURFACE_MIN_ALBEDO)), vec3f(60000.0)), 1.0);
    out.local = vec4f(exit * arriving, ahead);
    out.exit = vec4f(exit, 1.0);
    return out;
}
