// Máscara reativa do disco do sol pelo passe de desenho (ver `sky_reactive.wgsl`): um retângulo em volta dos dois discos
// (o vértice projeta as duas direções pela câmera sem o deslocamento), o fragmento só no fundo. O caminho do device sem
// storage de leitura e escrita do `r8unorm` (a mistura pelo máximo do hardware); com ele, `sky_reactive_tiles.wgsl`.
// Requer: sky_reactive.

struct SkyReactiveOut {
    @builtin(position) clip: vec4f,
    /** Os centros dos dois discos em pixels (o de agora em xy, o anterior em zw). */
    @location(0) @interpolate(flat) centers: vec4f,
    /** O raio com a margem (pixels). */
    @location(1) @interpolate(flat) radius: f32,
}

@vertex
fn sky_reactive_vs(@builtin(vertex_index) vid: u32) -> SkyReactiveOut {
    let size = vec2f(textureDimensions(sky_reactive_depth_tex));
    let d = sky_reactive_disks(size);
    var out: SkyReactiveOut;
    // Sem disco na tela: um triângulo degenerado.
    out.clip = vec4f(2.0, 2.0, 2.0, 1.0);
    out.centers = vec4f(0.0);
    out.radius = 0.0;
    if (d.radius < 0.0) { return out; }
    let lo = min(d.centers.xy, d.centers.zw) - d.radius;
    let hi = max(d.centers.xy, d.centers.zw) + d.radius;
    // Dois triângulos do retângulo (0 1 2, 2 1 3).
    var corners = array<vec2f, 6>(
        vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
        vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    );
    let corner = corners[vid % 6u];
    let px = mix(lo, hi, corner);
    out.clip = vec4f(uv_to_ndc(px / size), 0.0, 1.0);
    out.centers = d.centers;
    out.radius = d.radius;
    return out;
}

@fragment
fn sky_reactive_fs(in: SkyReactiveOut) -> @location(0) vec4f {
    let v = sky_reactive_mark(vec2u(in.clip.xy), in.clip.xy, SkyReactiveDisks(in.centers, in.radius));
    if (v <= 0.0) { discard; }
    return vec4f(v, 0.0, 0.0, 1.0);
}
