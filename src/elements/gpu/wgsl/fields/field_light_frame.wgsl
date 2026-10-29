// O referencial de uma luz direcional sobre a caixa do campo e o mapa da luz pela água de cada luz (spec 039 refeita).
// Requer: NONE, LIGHT_LIMIT, fields, lights.

/** Palavras por texel do mapa da luz: as camadas (entrada e saída de duas) e o Fresnel, os corpos. */
const FIELD_LIGHT_WORDS: u32 = 8u;

/** O referencial de uma luz direcional sobre a caixa do campo: os eixos do plano, a direção, a origem e o tamanho. */
struct FieldLightFrame {
    u: vec3f,
    v: vec3f,
    dir: vec3f,
    /** O canto (u, v) mínimo da projeção da caixa, no plano mais perto da luz. */
    origin: vec3f,
    /** A extensão em u e em v e o comprimento ao longo da luz (x = 0: sem caixa). */
    size: vec3f,
}

/** O referencial da luz de direção `direction` (o sentido em que a luz anda) sobre a caixa do campo. */
fn field_light_frame(direction: vec3f) -> FieldLightFrame {
    var f: FieldLightFrame;
    f.dir = normalize(direction);
    let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(f.dir.y) > 0.9);
    f.u = normalize(cross(up, f.dir));
    f.v = cross(f.dir, f.u);
    f.size = vec3f(0.0);
    let box = field_box();
    if (any(box[0] >= box[1])) { return f; }
    var lo = vec3f(1e30);
    var hi = vec3f(-1e30);
    for (var c = 0u; c < 8u; c++) {
        let corner = vec3f(select(box[0].x, box[1].x, (c & 1u) != 0u), select(box[0].y, box[1].y, (c & 2u) != 0u),
            select(box[0].z, box[1].z, (c & 4u) != 0u));
        let q = vec3f(dot(corner, f.u), dot(corner, f.v), dot(corner, f.dir));
        lo = min(lo, q);
        hi = max(hi, q);
    }
    // Meio voxel de folga: o texel da borda cobre a superfície que encosta na caixa.
    let pad = 0.5 * field_voxel();
    lo -= vec3f(pad);
    hi += vec3f(pad);
    f.origin = f.u * lo.x + f.v * lo.y + f.dir * lo.z;
    f.size = hi - lo;
    return f;
}

/** A origem do raio do texel em `uv` ∈ [0, 1]² (no plano mais perto da luz). */
fn field_light_origin(f: FieldLightFrame, uv: vec2f) -> vec3f {
    return f.origin + f.u * (uv.x * f.size.x) + f.v * (uv.y * f.size.y);
}

/** O slot da `k`-ésima luz direcional do pool (`NONE` sem ela). */
fn field_light_slot(k: u32) -> u32 {
    var seen = 0u;
    let count = min(arrayLength(&lights), LIGHT_LIMIT);
    for (var i = 0u; i < count; i++) {
        if (lights[i].kind != 0u || all(lights[i].color.rgb * lights[i].intensity <= vec3f(0.0))) { continue; }
        if (seen == k) { return i; }
        seen += 1u;
    }
    return NONE;
}

/** O mapa da luz do slot `light` (`NONE`: a luz não tem mapa — não é direcional ou passa das que têm). */
fn field_light_map_of(light: u32) -> u32 {
    if (light >= arrayLength(&lights) || lights[light].kind != 0u) { return NONE; }
    for (var k = 0u; k < fluid_field.lights.z; k++) {
        if (field_light_slot(k) == light) { return k; }
    }
    return NONE;
}
