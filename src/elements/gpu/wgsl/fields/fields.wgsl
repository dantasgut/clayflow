// Consulta ao campo dos fluidos (spec 033, R11): φ num ponto (trilinear para os passos da marcha; B-spline tricúbica com
// o gradiente para o cruzamento e a normal — contínua até a segunda derivada: a superfície é lisa de perto, em qualquer
// resolução de tela) e a marcha de um raio: pelos blocos ao longo do raio (os vazios pulados até a saída deles), dentro
// dos ocupados por passos de distância (φ é distância com sinal na faixa), o cruzamento refinado por secante; a saída
// (a espessura atravessada) pela mesma marcha por dentro. Sem bloco, vazio. A mesma superfície para a câmera, a luz, os
// raios da estrutura e a luz rebatida.
// Requer: NONE, fluid_field, field_common, field_lookup.

/** Acerto da marcha: distância, ponto, normal (para fora), material e se acertou. */
struct FieldHit {
    t: f32,
    p: vec3f,
    n: vec3f,
    material: u32,
    hit: bool,
}

/** φ trilinear no ponto `p` dentro do bloco de índice `brick` e coordenadas `b`. */
fn field_phi_linear(brick: u32, b: vec3i, p: vec3f) -> f32 {
    let g = p / field_voxel() - 0.5 - vec3f(b * FIELD_BRICK);
    let base = vec3i(floor(g));
    let f = g - vec3f(base);
    var phi = 0.0;
    for (var k = 0u; k < 8u; k++) {
        let o = vec3i(i32(k & 1u), i32((k >> 1u) & 1u), i32(k >> 2u));
        let v = clamp(base + o, vec3i(-FIELD_APRON), vec3i(FIELD_BRICK + FIELD_APRON - 1));
        let w = mix(vec3f(1.0) - f, f, vec3f(o));
        phi += field_voxel_value(field_apron_at(brick, v)) * w.x * w.y * w.z;
    }
    return phi;
}

/** Pesos da B-spline cúbica uniforme (x) e as derivadas (y) para a fração `t`. */
fn field_bspline(t: f32) -> mat4x2f {
    let t2 = t * t;
    let t3 = t2 * t;
    let s = 1.0 - t;
    return mat4x2f(
        vec2f(s * s * s / 6.0, -s * s / 2.0),
        vec2f((3.0 * t3 - 6.0 * t2 + 4.0) / 6.0, (3.0 * t2 - 4.0 * t) / 2.0),
        vec2f((-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0, (-3.0 * t2 + 2.0 * t + 1.0) / 2.0),
        vec2f(t3 / 6.0, t2 / 2.0),
    );
}

/** φ (w) e ∇φ (xyz) pela B-spline tricúbica no ponto `p` dentro do bloco `brick` de coordenadas `b`. */
fn field_cubic(brick: u32, b: vec3i, p: vec3f) -> vec4f {
    let g = p / field_voxel() - 0.5 - vec3f(b * FIELD_BRICK);
    let base = clamp(vec3i(floor(g)), vec3i(-1), vec3i(FIELD_BRICK - 1));
    let f = clamp(g - vec3f(base), vec3f(0.0), vec3f(1.0));
    let bx = field_bspline(f.x);
    let by = field_bspline(f.y);
    let bz = field_bspline(f.z);
    var out = vec4f(0.0);
    for (var k = 0; k < 4; k++) {
        for (var j = 0; j < 4; j++) {
            for (var i = 0; i < 4; i++) {
                let v = field_voxel_value(field_apron_at(brick, base + vec3i(i - 1, j - 1, k - 1)));
                let wx = bx[i];
                let wy = by[j];
                let wz = bz[k];
                out += v * vec4f(wx.y * wy.x * wz.x, wx.x * wy.y * wz.x, wx.x * wy.x * wz.y, wx.x * wy.x * wz.x);
            }
        }
    }
    return vec4f(out.xyz / field_voxel(), out.w);
}

/** φ tricúbico em `p` (vazio fora dos blocos: a faixa). */
fn field_phi_at(p: vec3f) -> f32 {
    let b = field_brick_of(p);
    let brick = field_find(b);
    if (brick == NONE) { return 3.0 * fluid_field.grid.w; }
    return field_cubic(brick, b, p).w;
}

/** Caixa do campo em mundo (os limites em voxels do suporte das partículas); vazia com lo ≥ hi. */
fn field_box() -> array<vec3f, 2> {
    let v = field_voxel();
    let lo = vec3f(f32(field_bound(0u)), f32(field_bound(1u)), f32(field_bound(2u))) * v;
    let hi = vec3f(f32(field_bound(3u)), f32(field_bound(4u)), f32(field_bound(5u))) * v;
    return array<vec3f, 2>(lo, hi);
}

/** Trecho [t0, t1] do raio dentro da caixa do campo (vazio: x ≥ y). */
fn field_clip(o: vec3f, d: vec3f, t0: f32, t1: f32) -> vec2f {
    let box = field_box();
    if (any(box[0] >= box[1])) { return vec2f(1.0, 0.0); }
    let safe = select(d, vec3f(1e-12), abs(d) < vec3f(1e-12));
    let a = (box[0] - o) / safe;
    let b = (box[1] - o) / safe;
    let near = min(a, b);
    let far = max(a, b);
    return vec2f(max(max(max(near.x, near.y), near.z), t0), min(min(min(far.x, far.y), far.z), t1));
}

/** Material (slot + 1 no pool `FluidSurfaceMaterial`) do bloco que contém `p`; 0 fora dos blocos. */
fn field_material_at(p: vec3f) -> u32 {
    let brick = field_find(field_brick_of(p));
    if (brick == NONE) { return 0u; }
    return u32(field_brick_at(brick).w);
}

/** Distância ao longo de `dir` até a saída do bloco `b` a partir de `p`. */
fn field_brick_exit(b: vec3i, p: vec3f, dir: vec3f) -> f32 {
    return field_cell_exit(vec3f(b) * field_brick_size(), field_brick_size(), p, dir);
}

/** Distância ao longo de `dir` até a saída do cubo [lo, lo + size] a partir de `p`. */
fn field_cell_exit(lo: vec3f, size: f32, p: vec3f, dir: vec3f) -> f32 {
    let hi = lo + vec3f(size);
    let inv = 1.0 / select(dir, vec3f(1e-12), abs(dir) < vec3f(1e-12));
    let t = select((lo - p) * inv, (hi - p) * inv, dir > vec3f(0.0));
    return max(min(min(t.x, t.y), t.z), 0.0);
}

/** φ trilinear em `p` com o bloco em cache (`cache.xyz` as coordenadas, `cache.w` o índice; trocado quando sai dele). */
fn field_phi_cached(p: vec3f, cache: ptr<function, vec4i>) -> f32 {
    let b = field_brick_of(p);
    if (any(b != (*cache).xyz)) { *cache = vec4i(b, bitcast<i32>(field_find(b))); }
    let brick = bitcast<u32>((*cache).w);
    if (brick == NONE) { return 3.0 * fluid_field.grid.w; }
    return field_phi_linear(brick, b, p);
}

/**
 * Marcha de `origin` na direção unitária `dir` de `t0` a `t1` até a superfície (de fora para dentro, `inside` falso) ou
 * até sair do fluido (de dentro para fora, `inside` verdadeiro). Pelos blocos: os vazios pulados até a saída deles (a
 * busca na tabela só quando o raio muda de bloco), nos ocupados passos de distância em φ trilinear. O cruzamento:
 * secante na trilinear e, com `refine`, um passo de Newton na tricúbica, que dá também a normal (contínua); sem `refine`
 * (só a distância, como a espessura), a secante basta.
 */
fn field_march(origin: vec3f, dir: vec3f, t0: f32, t1: f32, inside: bool, refine: bool) -> FieldHit {
    let miss = FieldHit(t1, origin + dir * t1, vec3f(0.0, 1.0, 0.0), 0u, false);
    let voxel = field_voxel();
    let sgn = select(1.0, -1.0, inside);
    let min_step = 0.25 * voxel;
    var cache = vec4i(2147483647, 0, 0, bitcast<i32>(NONE));
    var super_cache = vec4i(2147483647, 0, 0, 0);
    let super_size = 4.0 * field_brick_size();
    var t = t0;
    var t_prev = t0;
    var f_prev = 1e9;
    for (var steps = 0u; steps < 512u && t < t1; steps++) {
        let p = origin + dir * t;
        let b = field_brick_of(p);
        // Superbloco vazio: 4 blocos de uma vez (a busca na tabela pequena só quando o raio muda de superbloco).
        let sb = field_super_of(b);
        if (any(sb != super_cache.xyz)) { super_cache = vec4i(sb, select(0, 1, field_super_present(sb))); }
        if (super_cache.w == 0) {
            if (inside) { return FieldHit(t, p, -dir, 0u, true); }
            t += field_cell_exit(vec3f(sb) * super_size, super_size, p, dir) + 1e-4;
            f_prev = 1e9;
            continue;
        }
        if (any(b != cache.xyz)) { cache = vec4i(b, bitcast<i32>(field_find(b))); }
        let brick = bitcast<u32>(cache.w);
        let exit = field_brick_exit(b, p, dir) + 1e-4;
        if (brick == NONE) {
            // Bloco vazio: fora do fluido (vindo de dentro, a saída é aqui).
            if (inside) { return FieldHit(t, p, -dir, 0u, true); }
            t += exit;
            f_prev = 1e9;
            continue;
        }
        let f = sgn * field_phi_linear(brick, b, p);
        if (f <= 0.0) {
            // Cruzou: secante na trilinear entre o último passo do lado de partida e este.
            var a = t_prev;
            var fa = f_prev;
            if (f_prev > 1e8) { fa = sgn * field_phi_cached(origin + dir * t_prev, &cache); }
            var c = t;
            var fc = f;
            if (fa <= 0.0) { a = t; fa = fc; }
            for (var k = 0u; k < 4u; k++) {
                if (fa - fc == 0.0) { break; }
                let m = a + (c - a) * (fa / (fa - fc));
                let fm = sgn * field_phi_cached(origin + dir * m, &cache);
                if (fm > 0.0) { a = m; fa = fm; } else { c = m; fc = fm; }
            }
            var tc = select(a + (c - a) * (fa / (fa - fc)), c, fa - fc == 0.0);
            var material = field_brick_at(brick).w;
            if (!refine) { return FieldHit(tc, origin + dir * tc, -dir * sgn, u32(material), true); }
            // Newton na tricúbica (a superfície lisa): o ponto e a normal dela.
            var n = -dir * sgn;
            var pc = origin + dir * tc;
            let bc = field_brick_of(pc);
            let bi = field_find(bc);
            if (bi != NONE) {
                let g = field_cubic(bi, bc, pc);
                let slope = dot(g.xyz, dir);
                if (abs(slope) > 1e-6) { tc = clamp(tc - g.w / slope, a, c); }
                pc = origin + dir * tc;
                n = select(g.xyz / length(g.xyz), n, length(g.xyz) < 1e-8);
                material = field_brick_at(bi).w;
            }
            return FieldHit(tc, pc, n, u32(material), true);
        }
        t_prev = t;
        f_prev = f;
        t += min(max(f * 0.9, min_step), exit);
    }
    return miss;
}
