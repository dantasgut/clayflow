// Desenho conduzido pela GPU (spec 034, T060d): o descarte das instâncias dos grupos do desenho principal pelo tronco da
// vista e pela oclusão em duas fases (a hierarquia de profundidade do quadro anterior, pela série, e a deste quadro), e as
// listas densas de cada grupo com os argumentos dos desenhos indiretos. As contas são as da referência
// `elements/render/reference/drawCull.ts`.
//
//   1. `dc_phase1_main` (uma invocação por posição da lista de instâncias): a instância fora do tronco não desenha; a de
//      dentro desenha na fase 1 se a hierarquia do quadro anterior (pela vista anterior) não a esconde, senão fica para
//      a fase 2 (`dc_flags_b`);
//   2. a soma de prefixos inclusiva das marcas (`dc_scan_up_main`, `dc_scan_top_main`, `dc_scan_down_main`: grupos de 256
//      em até três níveis, os parâmetros de cada nível escritos só quando a lista muda), `dc_scatter_main` (a posição de cada marcada
//      no trecho do seu grupo, na ordem da lista: a imagem não depende da ordem dos atômicos) e `dc_args_main` (a
//      contagem de cada grupo nos argumentos, a partir do modelo do grupo);
//   0. `dc_policy_main` (um grupo, no começo): pelo estado e pelas medidas do quadro anterior (a série `dc_stats`), se
//      este quadro monta a hierarquia e se testa contra a do anterior — a oclusão segue enquanto se paga e é
//      experimentada de tempos em tempos (`cullPolicy` da referência); os despachos da hierarquia e da fase 2 são
//      indiretos (`dc_dispatch`: o modelo ou zero);
//   3. o desenho da fase 1 (a profundidade), a hierarquia deste quadro (`dc_hzb_base_*_main`, o nível 0 pela
//      profundidade e os 4 de cima no grupo de 16 × 16; `dc_hzb_top_main`, os demais num grupo só) e
//      `dc_phase2_main`: as escondidas na fase 1 contra a
//      hierarquia deste quadro, que só tem o que já foi desenhado (conservador); de novo a soma, a lista 2 (no trecho de
//      cada grupo, depois da lista 1) e os argumentos dela e das duas juntas (o desenho da cor, do movimento e dos
//      transmissivos).
// A hierarquia deste quadro é a fatia gravada da série (`dc_hzb`); o quadro seguinte a lê como a anterior. Laços com teto
// constante.

/** Bits de `dc.counts.w`: o descarte ligado; as séries (a hierarquia e as medidas) continuam do quadro anterior. */
const DC_ENABLED: u32 = 1u;
const DC_CONTINUOUS: u32 = 2u;
/** As medidas do quadro (`dc_stats`): as escondidas na fase 2, as candidatas a ela, as desenhadas na fase 1 e o estado. */
const DC_STAT_OCCLUDED: u32 = 0u;
const DC_STAT_CANDIDATES: u32 = 1u;
const DC_STAT_DRAWN: u32 = 2u;
const DC_STAT_STATE: u32 = 3u;
/** Bits do estado: a hierarquia montada neste quadro; o teste contra a do anterior; o descarte ligado (`cullPolicy`). */
const DC_BUILD: u32 = 1u;
const DC_TEST: u32 = 2u;
const DC_ON: u32 = 4u;
/** A cada quantos quadros a oclusão desligada é experimentada (`CULL_PROBE_PERIOD`) e a fração que a paga (1/20). */
const DC_PROBE_PERIOD: u32 = 64u;
const DC_USEFUL_DIVISOR: u32 = 20u;
/** Os despachos indiretos (3 palavras cada): os 2 primeiros da hierarquia, os demais da fase 2. */
const DC_DISPATCH_HZB: u32 = 2u;
/** Bits dos grupos: sem descarte (sprites, arame, caixa ainda desconhecida); argumentos não indexados. */
const DC_NO_CULL: u32 = 1u;
const DC_NON_INDEXED: u32 = 4u;
/** Palavras dos argumentos de um desenho indireto e de um grupo na tabela. */
const DC_ARGS_WORDS: u32 = 5u;
/** Registros de argumentos por grupo: a lista 1, a lista 2 (depois da 1 no trecho do grupo) e as duas juntas. */
const DC_RECORDS: u32 = 3u;
const DC_GROUP_WORDS: u32 = 4u;
/** Teto de pixels por eixo de um texel do nível 0 (`HZB_SPAN_MAX`) e dos níveis percorridos. */
const DC_SPAN_MAX: u32 = 16u;
/** Níveis montados pelo grupo de 16 × 16 do nível 0 (`HZB_TILE_LEVELS`). */
const DC_TILE_LEVELS: u32 = 5u;
const DC_LEVELS_MAX: u32 = 16u;
/** Abaixo deste `w` um canto está no plano da câmera ou atrás (`CULL_NEAR_W`). */
const DC_NEAR_W: f32 = 1e-5;
/** Folga da profundidade no teste de oclusão (`CULL_DEPTH_BIAS`, 2⁻²⁰): a face da própria caixa não a esconde. */
const DC_DEPTH_BIAS: f32 = 9.5367431640625e-7;

fn dc_slots() -> u32 { return dc.counts.y; }
fn dc_flags() -> u32 { return dc.counts.w; }

/** Os lados do nível `k` da hierarquia. */
fn dc_level_size(k: u32) -> vec2u {
    return max(vec2u(1u), dc.hzb.xy >> vec2u(k));
}

/** A primeira posição do nível `k` (os níveis em sequência). */
fn dc_level_offset(k: u32) -> u32 {
    var offset = 0u;
    for (var j = 0u; j < DC_LEVELS_MAX; j++) {
        if (j >= k) { break; }
        let s = dc_level_size(j);
        offset += s.x * s.y;
    }
    return offset;
}

/** Pixels `[início, fim)` de um eixo de `pixels` que tocam o texel `t` de um eixo de `texels` (pelo menos um). */
fn dc_pixel_range(t: u32, texels: u32, pixels: u32) -> vec2u {
    let start = min(pixels - 1u, (t * pixels) / texels);
    let end = max(start + 1u, min(pixels, ((t + 1u) * pixels + texels - 1u) / texels));
    return vec2u(start, end);
}

/** A caixa da instância em mundo: centro (xyz) e meia-extensão (Arvo). */
fn dc_world_box(m: mat4x4f, lo: vec3f, hi: vec3f) -> array<vec3f, 2> {
    let c = (lo + hi) * 0.5;
    let e = (hi - lo) * 0.5;
    let center = (m * vec4f(c, 1.0)).xyz;
    let extent = abs(m[0].xyz) * e.x + abs(m[1].xyz) * e.y + abs(m[2].xyz) * e.z;
    return array<vec3f, 2>(center, extent);
}

/** A caixa está toda fora de algum plano do tronco de `vp` (Gribb–Hartmann, profundidade em [0, 1]). */
fn dc_outside(vp: mat4x4f, c: vec3f, e: vec3f) -> bool {
    let r0 = vec4f(vp[0].x, vp[1].x, vp[2].x, vp[3].x);
    let r1 = vec4f(vp[0].y, vp[1].y, vp[2].y, vp[3].y);
    let r2 = vec4f(vp[0].z, vp[1].z, vp[2].z, vp[3].z);
    let r3 = vec4f(vp[0].w, vp[1].w, vp[2].w, vp[3].w);
    let planes = array<vec4f, 6>(r3 + r0, r3 - r0, r3 + r1, r3 - r1, r2, r3 - r2);
    for (var i = 0u; i < 6u; i++) {
        let n = planes[i];
        if (dot(n.xyz, c) + n.w + dot(abs(n.xyz), e) < 0.0) { return true; }
    }
    return false;
}

/** O texel `i` da hierarquia deste quadro (`current`) ou da anterior. */
fn dc_hzb_at(current: bool, i: u32) -> f32 {
    if (current) { return dc_hzb[i]; }
    return dc_hzb_previous[i];
}

/**
 * A caixa está escondida pela hierarquia: o retângulo dela na tela por `vp`, aumentado de um texel do nível 0 de cada
 * lado, lido no nível em que cabe em 2 × 2 texels; escondida se o ponto mais perto dela está atrás do mais longe ali.
 */
fn dc_occluded(vp: mat4x4f, c: vec3f, e: vec3f, current: bool) -> bool {
    var lo = vec3f(3.0e38);
    var hi = vec3f(-3.0e38);
    for (var i = 0u; i < 8u; i++) {
        let s = vec3f(
            select(-1.0, 1.0, (i & 1u) != 0u),
            select(-1.0, 1.0, (i & 2u) != 0u),
            select(-1.0, 1.0, (i & 4u) != 0u),
        );
        let clip = vp * vec4f(c + s * e, 1.0);
        if (clip.w <= DC_NEAR_W) { return false; }
        let ndc = clip.xyz / clip.w;
        lo = min(lo, ndc);
        hi = max(hi, ndc);
    }
    if (lo.z <= 0.0) { return false; }
    // O retângulo em uv (y para baixo: o y mais alto em NDC é o v menor), em texels do nível 0 com a margem.
    let size0 = vec2f(dc.hzb.xy);
    let a = clamp(ndc_to_uv(vec2f(lo.x, hi.y)), vec2f(0.0), vec2f(1.0)) * size0 - 1.0;
    let b = clamp(ndc_to_uv(vec2f(hi.x, lo.y)), vec2f(0.0), vec2f(1.0)) * size0 + 1.0;
    let u0 = a.x;
    let u1 = b.x;
    let v0 = a.y;
    let v1 = b.y;
    let span = max(max(u1 - u0, v1 - v0), 1.0);
    let level = min(dc.hzb.z - 1u, u32(max(0.0, ceil(log2(span)))));
    let dims = dc_level_size(level);
    let scale = f32(1u << level);
    let x0 = min(dims.x - 1u, u32(max(0.0, floor(u0 / scale))));
    let x1 = min(dims.x - 1u, u32(max(0.0, floor(u1 / scale))));
    let y0 = min(dims.y - 1u, u32(max(0.0, floor(v0 / scale))));
    let y1 = min(dims.y - 1u, u32(max(0.0, floor(v1 / scale))));
    let o = dc_level_offset(level);
    let far = max(
        max(dc_hzb_at(current, o + y0 * dims.x + x0), dc_hzb_at(current, o + y0 * dims.x + x1)),
        max(dc_hzb_at(current, o + y1 * dims.x + x0), dc_hzb_at(current, o + y1 * dims.x + x1)),
    );
    return lo.z > far + DC_DEPTH_BIAS;
}

/** A caixa da instância na posição `s` (centro e meia-extensão) e se o grupo dela descarta. */
struct DcInstance {
    center: vec3f,
    extent: vec3f,
    cull: bool,
}

fn dc_instance(s: u32, g: u32) -> DcInstance {
    var out: DcInstance;
    out.cull = false;
    if ((dc_groups[g * DC_GROUP_WORDS + 2u] & DC_NO_CULL) != 0u) { return out; }
    let lo = dc_bounds_read[2u * g].xyz;
    let hi = dc_bounds_read[2u * g + 1u].xyz;
    // A caixa vazia: a geometria ainda sem vértices (ou o kernel dela ainda não rodou) desenha.
    if (any(lo > hi)) { return out; }
    let r = renderables[instances[s].renderable];
    let box = dc_world_box(worlds[r.transformSlot].world, lo, hi);
    out.center = box[0];
    out.extent = box[1];
    out.cull = true;
    return out;
}

fn dc_index(gid: vec3u, nwg: vec3u) -> u32 {
    return gid.x + gid.y * nwg.x * WORKGROUP_SIZE;
}

/** O estado deste quadro (escrito por `dc_policy_main` no começo). */
fn dc_state() -> u32 {
    return atomicLoad(&dc_stats[DC_STAT_STATE]);
}

/**
 * A política (`cullPolicy` da referência): monta a hierarquia enquanto a oclusão se paga, no quadro de experimentar (e
 * no primeiro com o descarte ligado de novo) e no seguinte a uma montagem sem teste; testa quando o quadro anterior a montou e as séries continuam. Zera as medidas
 * deste quadro e escreve os despachos indiretos (o modelo, ou zero nos que não valem).
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn dc_policy_main(@builtin(local_invocation_index) lid: u32) {
    let previous = dc_stats_previous[DC_STAT_STATE];
    let built = (previous & DC_BUILD) != 0u;
    let tested = (previous & DC_TEST) != 0u;
    let was_on = (previous & DC_ON) != 0u;
    let counter = previous >> 8u;
    let occluded = dc_stats_previous[DC_STAT_OCCLUDED];
    let useful = tested && occluded > 0u
        && occluded * DC_USEFUL_DIVISOR >= dc_stats_previous[DC_STAT_DRAWN] + dc_stats_previous[DC_STAT_CANDIDATES];
    let enabled = (dc_flags() & DC_ENABLED) != 0u;
    let probe = counter % DC_PROBE_PERIOD == 0u || !was_on;
    let build = enabled && (useful || probe || (built && !tested));
    let test = enabled && (dc_flags() & DC_CONTINUOUS) != 0u && built;
    if (lid == 0u) {
        atomicStore(&dc_stats[DC_STAT_OCCLUDED], 0u);
        atomicStore(&dc_stats[DC_STAT_CANDIDATES], 0u);
        atomicStore(&dc_stats[DC_STAT_DRAWN], 0u);
        let bits = select(0u, DC_BUILD, build) | select(0u, DC_TEST, test) | select(0u, DC_ON, enabled);
        let state = bits | (((counter + 1u) & 0xFFFFFFu) << 8u);
        atomicStore(&dc_stats[DC_STAT_STATE], state);
    }
    let words = arrayLength(&dc_dispatch_template);
    for (var i = lid; i < words; i += WORKGROUP_SIZE) {
        let on = select(test, build, i < DC_DISPATCH_HZB * 3u);
        dc_dispatch[i] = select(0u, dc_dispatch_template[i], on);
    }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn dc_phase1_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let s = dc_index(gid, nwg);
    if (s >= dc_slots()) { return; }
    let g = dc_slot_group[s];
    if (g == NONE) {
        dc_flags_a[s] = 0u;
        dc_flags_b[s] = 0u;
        return;
    }
    var first = 1u;
    var later = 0u;
    if ((dc_flags() & DC_ENABLED) != 0u) {
        let inst = dc_instance(s, g);
        if (inst.cull) {
            let cam = cameras[dc.counts.x];
            if (dc_outside(cam.unjitteredViewProjection, inst.center, inst.extent)) {
                first = 0u;
            } else if ((dc_state() & DC_TEST) != 0u
                && dc_occluded(cam.previousViewProjection, inst.center, inst.extent, false)) {
                first = 0u;
                later = 1u;
            }
        }
    }
    dc_flags_a[s] = first;
    dc_flags_b[s] = later;
}

var<workgroup> dc_wg_occluded: atomic<u32>;
var<workgroup> dc_wg_candidates: atomic<u32>;

@compute @workgroup_size(WORKGROUP_SIZE)
fn dc_phase2_main(
    @builtin(global_invocation_id) gid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    if (lid == 0u) {
        atomicStore(&dc_wg_occluded, 0u);
        atomicStore(&dc_wg_candidates, 0u);
    }
    workgroupBarrier();
    let s = dc_index(gid, nwg);
    if (s < dc_slots() && dc_flags_b[s] != 0u) {
        let g = dc_slot_group[s];
        let inst = dc_instance(s, g);
        let cam = cameras[dc.counts.x];
        let hidden = inst.cull && dc_occluded(cam.viewProjection, inst.center, inst.extent, true);
        dc_flags_b[s] = select(1u, 0u, hidden);
        atomicAdd(&dc_wg_candidates, 1u);
        if (hidden) { atomicAdd(&dc_wg_occluded, 1u); }
    }
    workgroupBarrier();
    if (lid == 0u) {
        let c = atomicLoad(&dc_wg_candidates);
        if (c > 0u) {
            atomicAdd(&dc_stats[DC_STAT_CANDIDATES], c);
            atomicAdd(&dc_stats[DC_STAT_OCCLUDED], atomicLoad(&dc_wg_occluded));
        }
    }
}

// ---- a soma de prefixos inclusiva das marcas, no lugar ----

/** Elementos por grupo da soma. */
const DC_SCAN_GROUP: u32 = 256u;

var<workgroup> dc_scan_shared: array<u32, 256>;

/** O elemento `i` do nível `k` da soma da lista `list`: as marcas no nível 0, as somas dos grupos acima. */
fn dc_scan_load(list: u32, k: u32, i: u32) -> u32 {
    if (k > 0u) { return dc_scan_levels[dc_step.scan.y + i]; }
    if (list == 0u) { return dc_flags_a[i]; }
    return dc_flags_b[i];
}

fn dc_scan_store(list: u32, k: u32, i: u32, v: u32) {
    if (k > 0u) {
        dc_scan_levels[dc_step.scan.y + i] = v;
    } else if (list == 0u) {
        dc_flags_a[i] = v;
    } else {
        dc_flags_b[i] = v;
    }
}

/** A soma inclusiva do grupo de 256 no lugar (Hillis–Steele); devolve o valor da invocação. */
fn dc_scan_group(lid: u32, v: u32) -> u32 {
    dc_scan_shared[lid] = v;
    workgroupBarrier();
    for (var d = 1u; d < DC_SCAN_GROUP; d = d << 1u) {
        var add = 0u;
        if (lid >= d) { add = dc_scan_shared[lid - d]; }
        workgroupBarrier();
        dc_scan_shared[lid] += add;
        workgroupBarrier();
    }
    return dc_scan_shared[lid];
}

fn dc_workgroup(wid: vec3u, nwg: vec3u) -> u32 {
    return wid.x + wid.y * nwg.x;
}

/** Subida: a soma de cada grupo do nível `k` no lugar e o total do grupo no nível de cima (`dc_step.scan`). */
@compute @workgroup_size(256)
fn dc_scan_up_main(
    @builtin(local_invocation_index) lid: u32,
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let list = dc_step.value.x;
    let k = dc_step.value.y;
    let n = dc_step.scan.x;
    let g = dc_workgroup(wid, nwg);
    let i = g * DC_SCAN_GROUP + lid;
    var v = 0u;
    if (i < n) { v = dc_scan_load(list, k, i); }
    let sum = dc_scan_group(lid, v);
    if (i < n) { dc_scan_store(list, k, i, sum); }
    if (lid == DC_SCAN_GROUP - 1u) { dc_scan_levels[dc_step.scan.z + g] = sum; }
}

/** O topo (até 256 elementos, um grupo) no lugar. */
@compute @workgroup_size(256)
fn dc_scan_top_main(@builtin(local_invocation_index) lid: u32) {
    let list = dc_step.value.x;
    let k = dc_step.value.y;
    let n = dc_step.scan.x;
    var v = 0u;
    if (lid < n) { v = dc_scan_load(list, k, lid); }
    let sum = dc_scan_group(lid, v);
    if (lid < n) { dc_scan_store(list, k, lid, sum); }
}

/** Descida: cada elemento do nível `k` (fora do primeiro grupo) soma o total dos grupos antes do dele. */
@compute @workgroup_size(256)
fn dc_scan_down_main(
    @builtin(local_invocation_index) lid: u32,
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let list = dc_step.value.x;
    let k = dc_step.value.y;
    let n = dc_step.scan.x;
    let g = dc_workgroup(wid, nwg);
    let i = g * DC_SCAN_GROUP + lid;
    if (g == 0u || i >= n) { return; }
    dc_scan_store(list, k, i, dc_scan_load(list, k, i) + dc_scan_levels[dc_step.scan.z + g - 1u]);
}

/** A soma inclusiva das marcas da lista `list` na posição `s`. */
fn dc_scan(list: u32, s: u32) -> u32 {
    if (list == 0u) { return dc_flags_a[s]; }
    return dc_flags_b[s];
}

/** A soma antes da primeira posição do grupo. */
fn dc_scan_before(list: u32, first: u32) -> u32 {
    if (first == 0u) { return 0u; }
    return dc_scan(list, first - 1u);
}

/** Os argumentos do registro `r` (0: a lista 1; 1: a lista 2; 2: as duas) do grupo `g`. */
fn dc_record(g: u32, r: u32) -> u32 {
    return (g * DC_RECORDS + r) * DC_ARGS_WORDS;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn dc_scatter_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let s = dc_index(gid, nwg);
    let list = dc_step.value.x;
    if (s >= dc_slots()) { return; }
    let g = dc_slot_group[s];
    if (g == NONE) { return; }
    let incl = dc_scan(list, s);
    if (incl == dc_scan_before(list, s)) { return; }
    let first = dc_groups[g * DC_GROUP_WORDS];
    // A lista 2 continua a 1 no trecho do grupo (as duas juntas cabem nele: são partes disjuntas do grupo).
    var offset = 0u;
    if (list == 1u) { offset = dc_args[dc_record(g, 0u) + 1u]; }
    dc_visible[first + offset + incl - 1u - dc_scan_before(list, first)] = instances[s].renderable;
}

/** Um registro de argumentos pelo modelo do grupo: `n` instâncias a partir da posição `at` da lista. */
fn dc_write_args(g: u32, r: u32, n: u32, at: u32) {
    let base = dc_record(g, r);
    for (var k = 0u; k < DC_ARGS_WORDS; k++) { dc_args[base + k] = dc_template[g * DC_ARGS_WORDS + k]; }
    dc_args[base + 1u] = n;
    let flags = dc_groups[g * DC_GROUP_WORDS + 2u];
    dc_args[base + select(4u, 3u, (flags & DC_NON_INDEXED) != 0u)] = at;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn dc_args_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let g = dc_index(gid, nwg);
    let list = dc_step.value.x;
    if (g >= dc.counts.z) { return; }
    let first = dc_groups[g * DC_GROUP_WORDS];
    let count = dc_groups[g * DC_GROUP_WORDS + 1u];
    var n = 0u;
    if (count > 0u) { n = dc_scan(list, first + count - 1u) - dc_scan_before(list, first); }
    if (list == 0u) {
        dc_write_args(g, 0u, n, first);
        if (n > 0u) { atomicAdd(&dc_stats[DC_STAT_DRAWN], n); }
        return;
    }
    let n1 = dc_args[dc_record(g, 0u) + 1u];
    dc_write_args(g, 1u, n, first + n1);
    dc_write_args(g, 2u, n1 + n, first);
}

// ---- a hierarquia de profundidade ----

var<workgroup> dc_tile_a: array<f32, 256>;
var<workgroup> dc_tile_b: array<f32, 256>;

/** Grava o texel (x, y) do nível `k`. */
fn dc_hzb_store(k: u32, x: u32, y: u32, v: f32) {
    dc_hzb[dc_level_offset(k) + y * dc_level_size(k).x + x] = v;
}

/**
 * O nível 0 de um bloco de 16 × 16 texels (o valor `far` de cada invocação) e os 4 níveis de cima dele, pela memória do
 * grupo (os lados do nível 0 são múltiplos de 16: os blocos se dividem por inteiro até o nível 4).
 */
fn dc_hzb_tile(lid: vec2u, wid: vec2u, far: f32) {
    dc_hzb_store(0u, wid.x * 16u + lid.x, wid.y * 16u + lid.y, far);
    dc_tile_a[lid.y * 16u + lid.x] = far;
    workgroupBarrier();
    var side = 16u;
    for (var k = 1u; k < DC_TILE_LEVELS; k++) {
        side = side >> 1u;
        let inside = lid.x < side && lid.y < side;
        var v = 0.0;
        if (inside) {
            let o = 2u * lid.y * 16u + 2u * lid.x;
            if ((k & 1u) == 1u) {
                v = max(max(dc_tile_a[o], dc_tile_a[o + 1u]), max(dc_tile_a[o + 16u], dc_tile_a[o + 17u]));
            } else {
                v = max(max(dc_tile_b[o], dc_tile_b[o + 1u]), max(dc_tile_b[o + 16u], dc_tile_b[o + 17u]));
            }
        }
        workgroupBarrier();
        if (inside) {
            if ((k & 1u) == 1u) { dc_tile_b[lid.y * 16u + lid.x] = v; } else { dc_tile_a[lid.y * 16u + lid.x] = v; }
            dc_hzb_store(k, wid.x * side + lid.x, wid.y * side + lid.y, v);
        }
        workgroupBarrier();
    }
}

/** Os níveis acima dos blocos (do `DC_TILE_LEVELS` até 1 × 1), um grupo só, cada um do de baixo. */
@compute @workgroup_size(256)
fn dc_hzb_top_main(@builtin(local_invocation_index) lid: u32) {
    for (var k = DC_TILE_LEVELS; k < DC_LEVELS_MAX; k++) {
        if (k >= dc.hzb.z) { break; }
        let dims = dc_level_size(k);
        let below = dc_level_size(k - 1u);
        let o = dc_level_offset(k - 1u);
        for (var i = lid; i < dims.x * dims.y; i += 256u) {
            let x = i % dims.x;
            let y = i / dims.x;
            var far = 0.0;
            for (var dy = 0u; dy < 2u; dy++) {
                for (var dx = 0u; dx < 2u; dx++) {
                    let sx = min(below.x - 1u, 2u * x + dx);
                    let sy = min(below.y - 1u, 2u * y + dy);
                    far = max(far, dc_hzb[o + sy * below.x + sx]);
                }
            }
            dc_hzb[dc_level_offset(k) + i] = far;
        }
        storageBarrier();
    }
}
