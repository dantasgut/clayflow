// Esferas das partículas da superfície de água (spec 017): um quad por partícula com a posição lida do pool do corpo
// pelo índice da instância (como os sprites da 008). O passe de profundidade grava a profundidade linear da esfera e o
// material (o mais próximo vence pelo anexo de profundidade); o de espessura soma a corda da esfera cortada pela
// profundidade da cena. Structs `CameraMatrices`, `WaterLightMatrix`, `FluidSurfaceMaterial`, `WaterViewParams` e
// `WaterDrawParams` gerados dos schemas; a profundidade da cena (`water_scene.wgsl`) só oculta na vista da câmera — na
// da luz o estágio liga um substituto. Recursos declarados em `water/shaders.ts`.

struct WaterSphereOut {
    @builtin(position) clip_position: vec4f,
    @location(0) corner: vec2f,
    // Centro na vista: xyz da vista (câmera) ou NDC (luz).
    @location(1) center: vec3f,
    @location(2) @interpolate(flat) radius: f32,
    @location(3) @interpolate(flat) material: u32,
}

const WATER_CORNERS = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
);

fn water_finite(v: vec3f) -> bool {
    let a = abs(v);
    return a.x < 1e30 && a.y < 1e30 && a.z < 1e30;
}

@vertex
fn water_sphere_vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> WaterSphereOut {
    var out: WaterSphereOut;
    let corner = WATER_CORNERS[vi % 6u];
    let index = (water_draw.first + ii) * water_draw.strideVec4 + water_draw.posOffsetVec4;
    let pos = particles[index].xyz;
    let r = water_draw.radius;
    out.corner = corner;
    out.radius = r;
    out.material = water_draw.materialSlot;
    if (!water_finite(pos)) {
        // Partícula com posição não finita: fora do recorte, sem contaminar a superfície.
        out.clip_position = vec4f(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    if (water_view.view == 0u) {
        let cam = cameras[water_view.cameraSlot];
        let c = (cam.view * vec4f(pos, 1.0)).xyz;
        out.center = c;
        out.clip_position = cam.projection * vec4f(c + vec3f(corner * r, 0.0), 1.0);
    } else {
        let m = water_light_matrix.viewProj;
        let c = (m * vec4f(pos, 1.0)).xyz;
        let s = water_affine_scale(m);
        out.center = c;
        out.clip_position = vec4f(c.xy + corner * r * s.xy, c.z, 1.0);
    }
    return out;
}

struct WaterDepthOut {
    @location(0) depth: f32,
    @location(1) material: u32,
    @builtin(frag_depth) frag_depth: f32,
}

// Ponto da frente da esfera: profundidade linear (metros) e NDC.
fn water_sphere_front(in: WaterSphereOut, d2: f32) -> vec2f {
    let h = sqrt(1.0 - d2) * in.radius;
    if (water_view.view == 0u) {
        let cam = cameras[water_view.cameraSlot];
        let p = in.center + vec3f(in.corner * in.radius, h);
        return vec2f(-p.z, water_ndc_depth(p, cam.projection));
    }
    let m = water_light_matrix.viewProj;
    let sz = water_affine_scale(m).z;
    let ndc = in.center.z - h * sz;
    return vec2f(ndc / sz, ndc);
}

@fragment
fn water_depth_fs(in: WaterSphereOut) -> WaterDepthOut {
    let d2 = dot(in.corner, in.corner);
    if (d2 > 1.0) { discard; }
    let front = water_sphere_front(in, d2);
    // Sem recorte pela cena aqui: a composição testa a profundidade já suavizada contra a cena, e o corte sai liso
    // (recortar cada esfera deixaria o contorno serrilhado onde a água encontra um objeto).
    var out: WaterDepthOut;
    out.depth = front.x;
    out.material = in.material + 1u;
    out.frag_depth = clamp(front.y, 0.0, 1.0);
    return out;
}

// Espessura: a corda da esfera na direção da vista, cortada pela profundidade da cena (água atrás de um objeto não
// conta), escalada pelo material. Aditiva.
@fragment
fn water_thickness_fs(in: WaterSphereOut) -> @location(0) vec4f {
    let d2 = dot(in.corner, in.corner);
    if (d2 > 1.0) { discard; }
    let cam = cameras[water_view.cameraSlot];
    let h = sqrt(1.0 - d2) * in.radius;
    let front = -(in.center.z + h);
    let back = -(in.center.z - h);
    let scene = water_scene_linear(in.clip_position.xy, cam.projection);
    let chord = max(min(back, scene) - front, 0.0);
    if (chord <= 0.0) { discard; }
    return vec4f(chord * water_materials[in.material].thicknessScale, 0.0, 0.0, 0.0);
}
