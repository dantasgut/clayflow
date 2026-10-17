// Consulta da estrutura de raios da cena (spec 033, R1; FR-001, FR-003): `ray_scene_hit` devolve o acerto mais próximo
// (distância, instância, primitiva, baricêntricas, ponto, normal interpolada em mundo, registro `Renderable`) e
// `ray_scene_occluded` responde se algo bloqueia o segmento — pela hierarquia de cima sobre as instâncias e, em cada
// instância atingida, pela de baixo em espaço de objeto (a direção não é normalizada, então a distância é a de mundo).
// Quem consulta não conhece a origem da geometria: malhas, superfícies, grafos e partículas respondem igual.
// Requer: ray_common, ray_scene_info, ray_nodes, ray_vertices, ray_triangles, ray_spheres, ray_blas, ray_instances.

/** Acerto de um raio. `t = RAY_MISS` sem acerto. */
struct RayHit {
    t: f32,
    instance: u32,
    primitive: u32,
    renderable: u32,
    bary: vec2f,
    /** Lado de fora (1) ou de dentro (−1) da face geométrica, visto pelo raio. */
    face: f32,
    position: vec3f,
    normal: vec3f,
    uv: vec2f,
}

/** Pilha da travessia (a mesma da referência). */
const RAY_STACK: u32 = 32u;
/** Teto de nós visitados por travessia (salvaguarda contra uma hierarquia ainda incompleta). */
const RAY_MAX_VISITS: u32 = 4096u;

fn ray_miss() -> RayHit {
    return RayHit(RAY_MISS, NONE, NONE, NONE, vec2f(0.0), 1.0, vec3f(0.0), vec3f(0.0, 1.0, 0.0), vec2f(0.0));
}

/** Nó absoluto de uma hierarquia que começa em `base` (relativo à faixa). */
fn ray_node(base: u32, local: u32) -> RayNode {
    return ray_nodes[ray_scene_info.nodeFirst + base + local];
}

/** Primitiva local `prim` da hierarquia `blas`: distância em [0, t_max) em espaço de objeto, ou `RAY_MISS`. */
fn ray_primitive(blas: vec4u, prim: u32, o: vec3f, d: vec3f, t_max: f32) -> vec3f {
    if (blas.w == RAY_KIND_SPHERES) {
        let s = ray_spheres[ray_scene_info.sphereFirst + blas.y + prim].sphere;
        return vec3f(ray_sphere(o, d, s.xyz, s.w, t_max), 0.0, 0.0);
    }
    let tri = ray_triangles[ray_scene_info.triangleFirst + blas.y + prim].vertices;
    if (tri.x == NONE) { return vec3f(RAY_MISS, 0.0, 0.0); }
    let vf = ray_scene_info.vertexFirst;
    return ray_triangle(o, d, ray_vertices[vf + tri.x].position.xyz, ray_vertices[vf + tri.y].position.xyz,
        ray_vertices[vf + tri.z].position.xyz, t_max);
}

/** Acerto numa hierarquia de baixo: distância, baricêntricas e a primitiva (`NONE` sem acerto). */
struct RayBlasHit {
    t: f32,
    uv: vec2f,
    primitive: u32,
}

/** Acerto mais próximo na hierarquia de baixo `blas` (espaço de objeto); `first` para no primeiro acerto. */
fn ray_blas_hit(blas: vec4u, leaf_size: u32, o: vec3f, d: vec3f, t_max: f32, first: bool) -> RayBlasHit {
    var best = RayBlasHit(t_max, vec2f(0.0), NONE);
    let inv = 1.0 / d;
    var stack: array<u32, RAY_STACK>;
    var sp = 0u;
    stack[0] = 0u;
    sp = 1u;
    var visits = 0u;
    loop {
        if (sp == 0u || visits >= RAY_MAX_VISITS) { break; }
        visits = visits + 1u;
        sp = sp - 1u;
        let node = ray_node(blas.x, stack[sp]);
        if (ray_box(o, inv, node.lo.xyz, node.hi.xyz, best.t) == RAY_MISS) { continue; }
        let left = bitcast<u32>(node.lo.w);
        let right = bitcast<u32>(node.hi.w);
        if ((left & RAY_LEAF) != 0u) {
            // Folha: `leafSize` primitivas consecutivas a partir de `right` (sem passar do total).
            let end = min(right + leaf_size, blas.z);
            var found = false;
            for (var p = right; p < end; p++) {
                let h = ray_primitive(blas, p, o, d, best.t);
                if (h.x < best.t) {
                    best = RayBlasHit(h.x, h.yz, p);
                    found = true;
                }
            }
            if (found && first) { break; }
            continue;
        }
        let ln = ray_node(blas.x, left);
        let rn = ray_node(blas.x, right);
        let tl = ray_box(o, inv, ln.lo.xyz, ln.hi.xyz, best.t);
        let tr = ray_box(o, inv, rn.lo.xyz, rn.hi.xyz, best.t);
        // O filho mais próximo por último na pilha (sai primeiro).
        let near_left = tl <= tr;
        let far = select(left, right, near_left);
        let near = select(right, left, near_left);
        if (select(tl, tr, near_left) != RAY_MISS && sp < RAY_STACK) { stack[sp] = far; sp = sp + 1u; }
        if (select(tr, tl, near_left) != RAY_MISS && sp < RAY_STACK) { stack[sp] = near; sp = sp + 1u; }
    }
    return best;
}

/** Travessia de dois níveis: (t, u, v, primitiva) e a instância (`NONE` sem acerto). */
fn ray_scene_trace(origin: vec3f, dir: vec3f, t_max: f32, first: bool) -> RayHit {
    var hit = ray_miss();
    let count = ray_scene_info.instanceCount;
    if (count == 0u) { return hit; }
    var best = t_max;
    var best_uv = vec2f(0.0);
    let inv = 1.0 / dir;
    var stack: array<u32, RAY_STACK>;
    stack[0] = ray_scene_info.tlasRoot;
    var sp = 1u;
    var visits = 0u;
    loop {
        if (sp == 0u || visits >= RAY_MAX_VISITS) { break; }
        visits = visits + 1u;
        sp = sp - 1u;
        let local = stack[sp];
        let node = ray_nodes[ray_scene_info.nodeFirst + local];
        if (ray_box(origin, inv, node.lo.xyz, node.hi.xyz, best) == RAY_MISS) { continue; }
        let left = bitcast<u32>(node.lo.w);
        let right = bitcast<u32>(node.hi.w);
        if ((left & RAY_LEAF) != 0u) {
            let inst = ray_instances[ray_scene_info.instanceFirst + right];
            if (inst.ids.z == RAY_KIND_VOLUME) { continue; }
            let record = ray_blas[ray_scene_info.blasFirst + inst.ids.x];
            let o = (inst.toObject * vec4f(origin, 1.0)).xyz;
            let d = (inst.toObject * vec4f(dir, 0.0)).xyz;
            let h = ray_blas_hit(record.a, max(record.b.z, 1u), o, d, best, first);
            if (h.primitive != NONE && h.t < best) {
                best = h.t;
                best_uv = h.uv;
                hit.instance = right;
                hit.primitive = h.primitive;
                if (first) { break; }
            }
            continue;
        }
        // Nós da TLAS: filhos locais à hierarquia de cima (que começa em `tlasRoot`).
        let base = ray_scene_info.tlasRoot;
        let ln = ray_nodes[ray_scene_info.nodeFirst + base + left];
        let rn = ray_nodes[ray_scene_info.nodeFirst + base + right];
        let tl = ray_box(origin, inv, ln.lo.xyz, ln.hi.xyz, best);
        let tr = ray_box(origin, inv, rn.lo.xyz, rn.hi.xyz, best);
        let near_left = tl <= tr;
        let far = base + select(left, right, near_left);
        let near = base + select(right, left, near_left);
        if (select(tl, tr, near_left) != RAY_MISS && sp < RAY_STACK) { stack[sp] = far; sp = sp + 1u; }
        if (select(tr, tl, near_left) != RAY_MISS && sp < RAY_STACK) { stack[sp] = near; sp = sp + 1u; }
    }
    if (hit.instance == NONE) { return hit; }
    hit.t = best;
    hit.bary = best_uv;
    return hit;
}

/** Completa o acerto: ponto, normal interpolada em mundo, uv, lado da face e registro `Renderable`. */
fn ray_scene_resolve(hit_in: RayHit, origin: vec3f, dir: vec3f) -> RayHit {
    var hit = hit_in;
    if (hit.instance == NONE) { return hit; }
    let inst = ray_instances[ray_scene_info.instanceFirst + hit.instance];
    let blas = ray_blas[ray_scene_info.blasFirst + inst.ids.x].a;
    hit.renderable = inst.ids.y;
    hit.position = origin + dir * hit.t;
    // Normais em mundo pela transposta da inversa (as colunas de `toObject`).
    let n3 = transpose(mat3x3f(inst.toObject[0].xyz, inst.toObject[1].xyz, inst.toObject[2].xyz));
    var geometric: vec3f;
    if (blas.w == RAY_KIND_SPHERES) {
        let s = ray_spheres[ray_scene_info.sphereFirst + blas.y + hit.primitive].sphere;
        let o = (inst.toObject * vec4f(hit.position, 1.0)).xyz;
        geometric = normalize(n3 * (o - s.xyz));
        hit.normal = geometric;
        hit.uv = vec2f(0.0);
    } else {
        let tri = ray_triangles[ray_scene_info.triangleFirst + blas.y + hit.primitive].vertices;
        let vf = ray_scene_info.vertexFirst;
        let a = ray_vertices[vf + tri.x];
        let b = ray_vertices[vf + tri.y];
        let c = ray_vertices[vf + tri.z];
        let w = vec3f(1.0 - hit.bary.x - hit.bary.y, hit.bary.x, hit.bary.y);
        geometric = normalize(n3 * cross(b.position.xyz - a.position.xyz, c.position.xyz - a.position.xyz));
        let shading = a.normal.xyz * w.x + b.normal.xyz * w.y + c.normal.xyz * w.z;
        hit.normal = select(geometric, normalize(n3 * shading), dot(shading, shading) > 1e-12);
        hit.uv = vec2f(a.position.w, a.normal.w) * w.x + vec2f(b.position.w, b.normal.w) * w.y
            + vec2f(c.position.w, c.normal.w) * w.z;
    }
    hit.face = select(-1.0, 1.0, dot(geometric, dir) < 0.0);
    return hit;
}

/** Acerto mais próximo do raio (origem, direção unitária) até `t_max`. */
fn ray_scene_hit(origin: vec3f, dir: vec3f, t_max: f32) -> RayHit {
    return ray_scene_resolve(ray_scene_trace(origin, dir, t_max, false), origin, dir);
}

/** Algo bloqueia o segmento (origem, direção) até `t_max`? */
fn ray_scene_occluded(origin: vec3f, dir: vec3f, t_max: f32) -> bool {
    return ray_scene_trace(origin, dir, t_max, true).instance != NONE;
}
