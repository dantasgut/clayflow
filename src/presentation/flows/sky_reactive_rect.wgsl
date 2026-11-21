// Máscara reativa do disco do sol por compute (spec 041, T074; ver `sky_reactive.wgsl`): uma invocação acha o retângulo
// em volta dos dois discos na tela (o de agora e o do quadro anterior) e grava os argumentos do despacho indireto da
// marcação (`sky_reactive_tiles.wgsl`: um grupo de `SKY_REACTIVE_TILE`² pixels por bloco do retângulo) e os discos. Sem
// disco na tela, zero grupos: a marcação não roda nem abre passe — a decisão é da GPU, sem leitura na CPU.
// As palavras de `sky_reactive_work`: 0–2 os grupos (x, y, z), 4–5 a origem do retângulo em pixels, 6–9 os centros e 10 o
// raio com a margem (bits de f32).
// Requer: sky_reactive, SKY_REACTIVE_TILE, sky_reactive_work (leitura e escrita).

/** O máximo de grupos por dimensão de um despacho (`maxComputeWorkgroupsPerDimension` do núcleo). */
const SKY_REACTIVE_GROUPS_MAX: u32 = 65535u;

@compute @workgroup_size(1)
fn sky_reactive_rect_main() {
    let size = vec2f(textureDimensions(sky_reactive_depth_tex));
    let d = sky_reactive_disks(size);
    var groups = vec2u(0u);
    var origin = vec2u(0u);
    if (d.radius >= 0.0) {
        let lo = clamp(floor(min(d.centers.xy, d.centers.zw) - d.radius), vec2f(0.0), size);
        let hi = clamp(ceil(max(d.centers.xy, d.centers.zw) + d.radius), vec2f(0.0), size);
        if (all(hi > lo)) {
            origin = vec2u(lo);
            groups = min((vec2u(hi) - origin + SKY_REACTIVE_TILE - 1u) / SKY_REACTIVE_TILE, vec2u(SKY_REACTIVE_GROUPS_MAX));
        }
    }
    sky_reactive_work[0] = groups.x;
    sky_reactive_work[1] = groups.y;
    sky_reactive_work[2] = 1u;
    sky_reactive_work[4] = origin.x;
    sky_reactive_work[5] = origin.y;
    sky_reactive_work[6] = bitcast<u32>(d.centers.x);
    sky_reactive_work[7] = bitcast<u32>(d.centers.y);
    sky_reactive_work[8] = bitcast<u32>(d.centers.z);
    sky_reactive_work[9] = bitcast<u32>(d.centers.w);
    sky_reactive_work[10] = bitcast<u32>(d.radius);
}
