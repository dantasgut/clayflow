// Composição óptica da água (spec 017, research R5): um triângulo de tela cheia sobre os alvos da cena. Por pixel com
// água: a normal da superfície (a do campo dos fluidos, spec 033: contínua, em mundo), o fundo pela refração traçada
// (spec 034: o raio refratado pela estrutura de raios, `water_refraction.wgsl`; sem o traçado pronto, a cena de antes
// da água deslocada), absorção pela espessura (Beer-Lambert por canal), dispersão interna iluminada,
// e a superfície como dielétrico físico (spec 011, R9): o especular GGX de IOR do material reflete todas as luzes e o
// hemisfério pelo ponto de cena `scene_lighting` (o sol estoura em HDR, sem corte), e só a energia que não reflete
// segue para a refração. Consome a superfície genérica (profundidade, material e normal com a espessura em w por
// pixel) — não sabe de partículas. As ondulações do material (`water_ripple.wgsl`) somam o detalhe fino à normal. A composição não sabe
// qual luz ilumina nem de onde vem a sombra.
// Structs `CameraMatrices`, `FluidSurfaceMaterial` e `WaterCompositeParams` gerados dos schemas; recursos declarados em
// `water/shaders.ts`; a profundidade da cena vem do módulo da variante (com ou sem amostras).


struct CompositeOut {
    @location(0) color: vec4f,
    @builtin(frag_depth) depth: f32,
}

@fragment
fn water_composite_fs(@builtin(position) frag: vec4f) -> CompositeOut {
    let size_i = vec2i(textureDimensions(water_depth));
    let pi = vec2i(frag.xy);
    let w = water_point(pi);
    if (!w.valid) { discard; }
    let material = water_materials[w.material - 1u];
    let cam = cameras[water_composite.cameraSlot];
    let proj = cam.projection;
    let pw = w.position;
    let n = w.normal;
    let v = w.to_eye;
    let thickness = w.thickness;
    // Dentro: Beer-Lambert pela espessura e a luz espalhada no volume, na cor da água.
    let absorb = exp(-material.absorption.rgb * thickness);
    // O que se vê pela água: a radiância traçada no pixel (spec 034: o raio refratado pela cena, com a absorção do
    // volume) ou, sem o traçado pronto, a cena deslocada pela inclinação, atenuada pela espessura — o que está na
    // frente da água não é refratado; com dispersão, cada cor desloca na proporção do seu IOR.
    var background = vec3f(0.0);
    if (water_composite.traced != 0u) {
        background = textureLoad(refraction_radiance, pi, 0).rgb;
    } else {
        let nv = normalize(mat3x3f(cam.view[0].xyz, cam.view[1].xyz, cam.view[2].xyz) * n);
        let shift = vec2f(nv.x, -nv.y) * material.refraction * min(thickness, 1.0) * f32(size_i.y);
        let iors = closure_dispersion_iors(material.ior, material.abbe);
        let spread = (iors - vec3f(1.0)) / max(material.ior - 1.0, 1e-4);
        let z = -w.view.z;
        for (var k = 0; k < 3; k++) {
            var pr = clamp(vec2i(frag.xy + shift * spread[k]), vec2i(0), size_i - 1);
            if (water_scene_linear(vec2f(pr), proj) < z) { pr = pi; }
            background[k] = textureLoad(scene_copy, pr, 0)[k];
        }
        background = background * absorb;
    }
    // Superfície: dielétrico de IOR do material (Fresnel e GGX), refletindo as luzes e o hemisfério.
    let surface = closure_dielectric(material.ior, vec3f(1.0), material.roughness, 0.0, vec3f(0.0));
    let reflected = scene_lighting(surface, pw, n, v);
    let cos_v = clamp(dot(n, v), 1e-4, 1.0);
    let into = vec3f(1.0) - closure_base_albedo(surface, cos_v);
    let scattered = scene_lighting(closure_diffuse(material.color.rgb, 0.0), pw, n, v);
    // Névoa (ponto `scene_fog`): o fundo já a tem até ele; a luz da superfície e a espalhada na água a atravessam até a
    // câmera, e a fração que vem do fundo (τ) leva a dele — T·R + τ·B + (1 − τ)·S.
    let fog = scene_fog(pw);
    let tau = into * absorb;
    var color = (reflected + into * scattered * (1.0 - absorb)) * fog.a + into * background + (vec3f(1.0) - tau) * fog.rgb;
    if (!all(abs(color) < vec3f(6.5e4))) { color = material.color.rgb; }
    var out: CompositeOut;
    out.color = vec4f(max(color, vec3f(0.0)), 1.0);
    out.depth = clamp(water_ndc_depth(w.view, proj), 0.0, 1.0);
    return out;
}
