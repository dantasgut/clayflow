// Peças comuns da construção de um colisor de superfície (spec 010): codificação de f32 em u32 com ordem total (para
// atomicMin/atomicMax — o resultado não depende da ordem das threads), índice de cópia e de amostra, os três vértices
// de um triângulo da grade de amostragem e o ponto mais próximo de um triângulo.
// Requer: struct `SurfaceBakeParams`; o uniforme `bake` do kernel.

const SCB_NONE: u32 = 0xFFFFFFFFu;

// f32 → u32 com a mesma ordem (negativos invertidos).
fn scb_order(f: f32) -> u32 {
    let u = bitcast<u32>(f);
    return select(u | 0x80000000u, ~u, (u & 0x80000000u) != 0u);
}

fn scb_unorder(u: u32) -> f32 {
    return bitcast<f32>(select(~u, u & 0x7FFFFFFFu, (u & 0x80000000u) != 0u));
}

// Item de uma passada: as cópias ficam em sequência no índice linear (`count` itens por cópia).
struct ScbItem {
    i: u32,
    k: u32,
}

fn scb_item(linear: u32, count: u32) -> ScbItem {
    return ScbItem(linear % max(count, 1u), linear / max(count, 1u));
}

// Tempo do fim do passo da cópia k.
fn scb_time(k: u32) -> f32 {
    var t = array<vec4f, 4>(bake.t0, bake.t1, bake.t2, bake.t3);
    return t[k / 4u][k % 4u];
}

// Vértices (amostras) do triângulo t da grade nu × nv: dois por célula, [a, b, c] e [b, d, c] como a malha.
fn scb_triangle(t: u32) -> vec3u {
    let q = t / 2u;
    let iu = q % (bake.nu - 1u);
    let iv = q / (bake.nu - 1u);
    let a = iu + iv * bake.nu;
    let b = a + 1u;
    let c = a + bake.nu;
    let d = c + 1u;
    return select(vec3u(b, d, c), vec3u(a, b, c), (t % 2u) == 0u);
}

struct ScbClosest {
    point: vec3f,
    bary: vec3f,
}

// Ponto do triângulo abc mais próximo de p (Ericson, Real-Time Collision Detection 5.1.5) e as suas coordenadas
// baricêntricas.
fn scb_closest(p: vec3f, a: vec3f, b: vec3f, c: vec3f) -> ScbClosest {
    let ab = b - a;
    let ac = c - a;
    let ap = p - a;
    let d1 = dot(ab, ap);
    let d2 = dot(ac, ap);
    if (d1 <= 0.0 && d2 <= 0.0) { return ScbClosest(a, vec3f(1.0, 0.0, 0.0)); }
    let bp = p - b;
    let d3 = dot(ab, bp);
    let d4 = dot(ac, bp);
    if (d3 >= 0.0 && d4 <= d3) { return ScbClosest(b, vec3f(0.0, 1.0, 0.0)); }
    let vc = d1 * d4 - d3 * d2;
    if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) {
        let v = d1 / (d1 - d3);
        return ScbClosest(a + v * ab, vec3f(1.0 - v, v, 0.0));
    }
    let cp = p - c;
    let d5 = dot(ab, cp);
    let d6 = dot(ac, cp);
    if (d6 >= 0.0 && d5 <= d6) { return ScbClosest(c, vec3f(0.0, 0.0, 1.0)); }
    let vb = d5 * d2 - d1 * d6;
    if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) {
        let w = d2 / (d2 - d6);
        return ScbClosest(a + w * ac, vec3f(1.0 - w, 0.0, w));
    }
    let va = d3 * d6 - d5 * d4;
    if (va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0) {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return ScbClosest(b + w * (c - b), vec3f(0.0, 1.0 - w, w));
    }
    let denom = 1.0 / (va + vb + vc);
    let v = vb * denom;
    let w = vc * denom;
    return ScbClosest(a + ab * v + ac * w, vec3f(1.0 - v - w, v, w));
}
