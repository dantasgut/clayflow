// Consulta de um colisor de superfície (spec 010): campo de alturas (terreno) ou de distâncias com sinal (superfície
// geral) construído na GPU pelo `SurfaceColliderFlow`, uma cópia por passo fixo do quadro quando a superfície anima.
// A cópia lida é a do passo corrente: a primeira cujo tempo (fim do passo) não é anterior a `collider_time`, que o
// kernel hospedeiro define com o tempo da iteração (`field_time` dos parâmetros do solver) antes de consultar.
//
// Layout de cada cópia no pool `collider_surface_field` (floats a partir de `first + k · copy_stride`):
//   0..2 caixa local mínima · 4..6 caixa local máxima · 8..23 inversa da matriz de mundo (colunas)
//   24..35 matriz normal mundo ← local (3 colunas de vec4) · 36 escala local → mundo das distâncias
//   37 cópias construídas (u32) · 40..55 tempos das cópias · 56..58 nós por eixo (u32) · 59 floats por cópia (u32)
//   60 modo (u32: 0 altura, 1 distância) · 61 folga (m) — de 37 a 61 só na cópia 0 · 64.. valores (nós da grade; altura: x + nx·z; distância: x + nx·(y + ny·z))
// Altura: nó sem triângulo acima = SURFACE_NO_HEIGHT (fora do terreno: sem contato). Distância: fora da caixa, sem contato.
//
// As consultas recebem o início do colisor no pool (`first`; quem consulta o obtém das suas contagens).
// Requer: o recurso `collider_surface_field`; struct `ColliderHit`.

const SURFACE_COLLIDER_HEADER: u32 = 64u;
const SURFACE_NO_HEIGHT: f32 = -3.0e38;
const SURFACE_FAR: f32 = 3.0e38;

// Tempo da iteração do solver que consulta (definido pelo kernel hospedeiro; 0 escolhe a primeira cópia).
var<private> collider_time: f32;

// Cópia do passo de `collider_time`: a primeira construída cujo tempo não é anterior a ele (tolerância relativa).
fn surface_copy(first: u32, built: u32) -> u32 {
    let tol = 1e-5 * max(1.0, abs(collider_time));
    var k = 0u;
    loop {
        if (k + 1u >= built || surface_field(first, 40u + k) >= collider_time - tol) { break; }
        k++;
    }
    return k;
}

fn surface_field(base: u32, k: u32) -> f32 {
    return collider_surface_field[base + k];
}

fn surface_field3(base: u32, k: u32) -> vec3f {
    return vec3f(surface_field(base, k), surface_field(base, k + 1u), surface_field(base, k + 2u));
}

// Sem contato: distância enorme com a normal para cima.
fn surface_hit_far() -> ColliderHit {
    return ColliderHit(SURFACE_FAR, vec3f(0.0, 1.0, 0.0));
}

// Altura no nó (ix, iz) da cópia.
fn surface_height_at(base: u32, nx: u32, ix: u32, iz: u32) -> f32 {
    return surface_field(base, SURFACE_COLLIDER_HEADER + ix + nx * iz);
}

// Gradiente da altura (∂h/∂x, ∂h/∂z) no nó, por diferenças centrais (de um lado na borda ou junto a nó sem altura).
fn surface_height_gradient(base: u32, c: SurfaceColliderInfo, ix: u32, iz: u32, cell: vec2f) -> vec2f {
    let h = surface_height_at(base, c.nx, ix, iz);
    let x0 = select(ix, ix - 1u, ix > 0u);
    let x1 = min(ix + 1u, c.nx - 1u);
    let z0 = select(iz, iz - 1u, iz > 0u);
    let z1 = min(iz + 1u, c.nz - 1u);
    var hx0 = surface_height_at(base, c.nx, x0, iz);
    var hx1 = surface_height_at(base, c.nx, x1, iz);
    var hz0 = surface_height_at(base, c.nx, ix, z0);
    var hz1 = surface_height_at(base, c.nx, ix, z1);
    var dx = f32(x1 - x0);
    var dz = f32(z1 - z0);
    if (hx0 <= SURFACE_NO_HEIGHT) { hx0 = h; dx = f32(x1 - ix); }
    if (hx1 <= SURFACE_NO_HEIGHT) { hx1 = h; dx = f32(ix - x0); }
    if (hz0 <= SURFACE_NO_HEIGHT) { hz0 = h; dz = f32(z1 - iz); }
    if (hz1 <= SURFACE_NO_HEIGHT) { hz1 = h; dz = f32(iz - z0); }
    return vec2f(
        select(0.0, (hx1 - hx0) / (dx * cell.x), dx > 0.0),
        select(0.0, (hz1 - hz0) / (dz * cell.y), dz > 0.0),
    );
}

// Distância no nó (ix, iy, iz) da cópia.
fn surface_distance_at(base: u32, nx: u32, ny: u32, ix: u32, iy: u32, iz: u32) -> f32 {
    return surface_field(base, SURFACE_COLLIDER_HEADER + ix + nx * (iy + ny * iz));
}

// Metadados do colisor (cópia 0 do campo).
struct SurfaceColliderInfo {
    first: u32,
    nx: u32,
    ny: u32,
    nz: u32,
    copy_stride: u32,
    mode: u32,
    margin: f32,
}

fn surface_collider_info(first: u32) -> SurfaceColliderInfo {
    return SurfaceColliderInfo(
        first,
        bitcast<u32>(surface_field(first, 56u)),
        bitcast<u32>(surface_field(first, 57u)),
        bitcast<u32>(surface_field(first, 58u)),
        bitcast<u32>(surface_field(first, 59u)),
        bitcast<u32>(surface_field(first, 60u)),
        surface_field(first, 61u),
    );
}

// Folga de contato do colisor que começa em `first` (somada ao raio de quem colide).
fn surface_collider_margin(first: u32) -> f32 {
    return surface_field(first, 61u);
}

fn collider_hit_surface(first: u32, p: vec3f) -> ColliderHit {
    let c = surface_collider_info(first);
    let built = bitcast<u32>(surface_field(c.first, 37u));
    if (built == 0u || c.nx < 2u || c.nz < 2u) { return surface_hit_far(); }
    let k = surface_copy(c.first, built);
    let base = c.first + k * c.copy_stride;
    let inv = mat4x4f(
        vec4f(surface_field3(base, 8u), surface_field(base, 11u)),
        vec4f(surface_field3(base, 12u), surface_field(base, 15u)),
        vec4f(surface_field3(base, 16u), surface_field(base, 19u)),
        vec4f(surface_field3(base, 20u), surface_field(base, 23u)),
    );
    let normal_m = mat3x3f(surface_field3(base, 24u), surface_field3(base, 28u), surface_field3(base, 32u));
    let scale = surface_field(base, 36u);
    let lo = surface_field3(base, 0u);
    let hi = surface_field3(base, 4u);
    let local = (inv * vec4f(p, 1.0)).xyz;
    let extent = max(hi - lo, vec3f(1e-12));
    var dl: f32;
    var nl: vec3f;
    if (c.mode == 0u) {
        let gx = (local.x - lo.x) / extent.x * f32(c.nx - 1u);
        let gz = (local.z - lo.z) / extent.z * f32(c.nz - 1u);
        if (!(gx >= 0.0 && gz >= 0.0 && gx <= f32(c.nx - 1u) && gz <= f32(c.nz - 1u))) { return surface_hit_far(); }
        let ix = min(u32(gx), c.nx - 2u);
        let iz = min(u32(gz), c.nz - 2u);
        let fx = gx - f32(ix);
        let fz = gz - f32(iz);
        let h00 = surface_height_at(base, c.nx, ix, iz);
        let h10 = surface_height_at(base, c.nx, ix + 1u, iz);
        let h01 = surface_height_at(base, c.nx, ix, iz + 1u);
        let h11 = surface_height_at(base, c.nx, ix + 1u, iz + 1u);
        if (min(min(h00, h10), min(h01, h11)) <= SURFACE_NO_HEIGHT) { return surface_hit_far(); }
        let h = mix(mix(h00, h10, fx), mix(h01, h11, fx), fz);
        // Normal contínua: gradiente nos nós por diferenças centrais (de um lado na borda), interpolado.
        let cell = vec2f(extent.x / f32(c.nx - 1u), extent.z / f32(c.nz - 1u));
        let g = mix(
            mix(surface_height_gradient(base, c, ix, iz, cell), surface_height_gradient(base, c, ix + 1u, iz, cell), fx),
            mix(surface_height_gradient(base, c, ix, iz + 1u, cell), surface_height_gradient(base, c, ix + 1u, iz + 1u, cell), fx),
            fz,
        );
        nl = normalize(vec3f(-g.x, 1.0, -g.y));
        dl = (local.y - h) * nl.y;
    } else {
        let n = vec3f(f32(c.nx - 1u), f32(c.ny - 1u), f32(c.nz - 1u));
        let g = (local - lo) / extent * n;
        if (!(all(g >= vec3f(0.0)) && all(g <= n))) { return surface_hit_far(); }
        let ix = min(u32(g.x), c.nx - 2u);
        let iy = min(u32(g.y), c.ny - 2u);
        let iz = min(u32(g.z), c.nz - 2u);
        let f = g - vec3f(f32(ix), f32(iy), f32(iz));
        let d000 = surface_distance_at(base, c.nx, c.ny, ix, iy, iz);
        let d100 = surface_distance_at(base, c.nx, c.ny, ix + 1u, iy, iz);
        let d010 = surface_distance_at(base, c.nx, c.ny, ix, iy + 1u, iz);
        let d110 = surface_distance_at(base, c.nx, c.ny, ix + 1u, iy + 1u, iz);
        let d001 = surface_distance_at(base, c.nx, c.ny, ix, iy, iz + 1u);
        let d101 = surface_distance_at(base, c.nx, c.ny, ix + 1u, iy, iz + 1u);
        let d011 = surface_distance_at(base, c.nx, c.ny, ix, iy + 1u, iz + 1u);
        let d111 = surface_distance_at(base, c.nx, c.ny, ix + 1u, iy + 1u, iz + 1u);
        let x00 = mix(d000, d100, f.x);
        let x10 = mix(d010, d110, f.x);
        let x01 = mix(d001, d101, f.x);
        let x11 = mix(d011, d111, f.x);
        let y0 = mix(x00, x10, f.y);
        let y1 = mix(x01, x11, f.y);
        dl = mix(y0, y1, f.z);
        // Gradiente da interpolação trilinear (por célula), em unidades locais.
        let cell = extent / n;
        let gx = mix(mix(d100 - d000, d110 - d010, f.y), mix(d101 - d001, d111 - d011, f.y), f.z) / cell.x;
        let gy = mix(x10 - x00, x11 - x01, f.z) / cell.y;
        let gz = (y1 - y0) / cell.z;
        let grad = vec3f(gx, gy, gz);
        let len = length(grad);
        nl = select(vec3f(0.0, 1.0, 0.0), grad / len, len > 1e-12);
    }
    let nw = normal_m * nl;
    let lw = length(nw);
    return ColliderHit(dl * scale, select(vec3f(0.0, 1.0, 0.0), nw / lw, lw > 1e-12));
}
