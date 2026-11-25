// Os fins de caminho guardados por pixel (spec 011, a retomada): de cada caminho traçado, o que não depende das luzes —
// onde cada vaga escapa da cena (a origem e a direção do último trecho) e com que peso, e a luz do resto do caminho (os
// pontos opacos, os brilhos nas interfaces, os meios). Com a câmera e a cena paradas e as luzes mudando, o pixel que não
// foi traçado no quadro recalcula a luz dos fins guardados com as luzes de agora (`refraction_chain_upsample_main`), em
// vez de mostrar a de quadros atrás (a grade de pontos) ou a média dos representantes em volta (a imagem que vibra com
// a vez do representante).
//
// A memória é por páginas: a tela em ladrilhos de 8 × 8 pixels, e só o ladrilho com pixel traçado recebe uma página (os
// registros dos 64 pixels dele). `refraction_ends` (palavras atômicas): o cabeçalho, a tabela (uma entrada por ladrilho)
// e as páginas. A entrada: a época nos 12 bits de cima e a página + 1 nos 20 de baixo (0: nenhuma; `FULL`: pedida sem
// página livre). Sem páginas livres, a época avança e todas voltam (no máximo a cada `REFRACTION_ENDS_RESET_FRAMES`): o
// pixel sem registro segue pela reconstrução.
// Requer: refraction, refraction_ends.

/** Palavras do cabeçalho: a época, as páginas dadas, o quadro da última volta das páginas. */
const REFRACTION_ENDS_HEADER: u32 = 4u;
/** O lado do ladrilho (pixels). */
const REFRACTION_ENDS_TILE: u32 = 8u;
/** Fins guardados por pixel (as vagas da cadeia, `REFRACTION_CHAIN_SLOTS`). */
const REFRACTION_ENDS_SLOTS: u32 = 5u;
/** Palavras do registro de um pixel: 4 por fim e 4 do resto (a luz que fica, rgb, e o quadro + 1 do traçado). */
const REFRACTION_ENDS_WORDS: u32 = 24u;
/** Palavras de uma página (64 registros). */
const REFRACTION_ENDS_PAGE: u32 = 1536u;
/** A entrada do ladrilho pedido sem página livre (ou com a página a caminho). */
const REFRACTION_ENDS_FULL: u32 = 0xFFFFFu;
/** Quadros entre duas voltas das páginas. */
const REFRACTION_ENDS_RESET_FRAMES: u32 = 64u;

/** Ladrilhos da tela `size`. */
fn refraction_ends_tiles(size: vec2u) -> u32 {
    let t = (size + vec2u(REFRACTION_ENDS_TILE - 1u)) / REFRACTION_ENDS_TILE;
    return t.x * t.y;
}

/** A palavra da entrada do ladrilho do pixel `p`. */
fn refraction_ends_tile(p: vec2u, size: vec2u) -> u32 {
    let across = (size.x + REFRACTION_ENDS_TILE - 1u) / REFRACTION_ENDS_TILE;
    return REFRACTION_ENDS_HEADER + p.x / REFRACTION_ENDS_TILE + (p.y / REFRACTION_ENDS_TILE) * across;
}

/** Páginas que cabem depois da tabela. */
fn refraction_ends_capacity(size: vec2u) -> u32 {
    let used = REFRACTION_ENDS_HEADER + refraction_ends_tiles(size);
    let n = arrayLength(&refraction_ends);
    return min(select(0u, (n - used) / REFRACTION_ENDS_PAGE, n > used), REFRACTION_ENDS_FULL - 1u);
}

fn refraction_ends_epoch() -> u32 {
    return atomicLoad(&refraction_ends[0]) & 0xFFFu;
}

/** A entrada do ladrilho do pixel `p` quando ele tem página na época corrente (senão 0). */
fn refraction_ends_entry(p: vec2u, size: vec2u) -> u32 {
    let e = atomicLoad(&refraction_ends[refraction_ends_tile(p, size)]);
    let page = e & 0xFFFFFu;
    if ((e >> 20u) != refraction_ends_epoch() || page == 0u || page == REFRACTION_ENDS_FULL) { return 0u; }
    return e;
}

/** A primeira palavra do registro do pixel `p` na página da entrada `entry` (de `refraction_ends_entry`, não 0). */
fn refraction_ends_at(entry: u32, p: vec2u, size: vec2u) -> u32 {
    let q = p % REFRACTION_ENDS_TILE;
    return REFRACTION_ENDS_HEADER + refraction_ends_tiles(size) + ((entry & 0xFFFFFu) - 1u) * REFRACTION_ENDS_PAGE
        + (q.x + q.y * REFRACTION_ENDS_TILE) * REFRACTION_ENDS_WORDS;
}

/**
 * O pixel `p` no canto do ladrilho dele limpa a entrada de outra época (uma invocação por ladrilho): a página dela já
 * voltou. Pela troca condicional: quem pede a página no mesmo passe (`refraction_ends_claim`) não a perde.
 */
fn refraction_ends_sweep(p: vec2u, size: vec2u) {
    if (any(p % REFRACTION_ENDS_TILE != vec2u(0u))) { return; }
    let t = refraction_ends_tile(p, size);
    let e = atomicLoad(&refraction_ends[t]);
    if (e == 0u || (e >> 20u) == refraction_ends_epoch()) { return; }
    let swept = atomicCompareExchangeWeak(&refraction_ends[t], e, 0u);
}

/**
 * O ladrilho do pixel traçado `p` pede a página dele, se não a tem: um só dos pixels do ladrilho ganha a troca
 * condicional e tira a página da contagem (os outros a acham na entrada depois do passe); sem página livre, a entrada
 * fica `FULL` até a volta das páginas.
 */
fn refraction_ends_claim(p: vec2u, size: vec2u) {
    let t = refraction_ends_tile(p, size);
    let epoch = refraction_ends_epoch();
    let e = atomicLoad(&refraction_ends[t]);
    if ((e >> 20u) == epoch && (e & 0xFFFFFu) != 0u) { return; }
    if (!atomicCompareExchangeWeak(&refraction_ends[t], e, (epoch << 20u) | REFRACTION_ENDS_FULL).exchanged) { return; }
    let page = atomicAdd(&refraction_ends[1], 1u);
    if (page < refraction_ends_capacity(size)) { atomicStore(&refraction_ends[t], (epoch << 20u) | (page + 1u)); }
}

/**
 * Depois dos pedidos do quadro (uma invocação): sem página livre, e passados `REFRACTION_ENDS_RESET_FRAMES` da última
 * volta, a época avança e todas as páginas voltam — os ladrilhos que a câmera deixou para trás soltam as deles.
 */
fn refraction_ends_turn(size: vec2u) {
    let capacity = refraction_ends_capacity(size);
    if (capacity == 0u || atomicLoad(&refraction_ends[1]) < capacity) { return; }
    if (refraction.frame - atomicLoad(&refraction_ends[2]) < REFRACTION_ENDS_RESET_FRAMES) { return; }
    atomicStore(&refraction_ends[0], (refraction_ends_epoch() + 1u) & 0xFFFu);
    atomicStore(&refraction_ends[1], 0u);
    atomicStore(&refraction_ends[2], refraction.frame);
}

/** A direção unitária `v` em coordenadas octaédricas de 16 + 16 bits. */
fn refraction_ends_oct(v: vec3f) -> u32 {
    let n = v / (abs(v.x) + abs(v.y) + abs(v.z));
    var e = n.xy;
    if (n.z < 0.0) { e = (1.0 - abs(n.yx)) * select(vec2f(-1.0), vec2f(1.0), n.xy >= vec2f(0.0)); }
    let q = vec2u(round(clamp(e * 0.5 + 0.5, vec2f(0.0), vec2f(1.0)) * 65535.0));
    return q.x | (q.y << 16u);
}

/** A direção das coordenadas octaédricas de 16 + 16 bits `word`. */
fn refraction_ends_dir(word: u32) -> vec3f {
    let e = vec2f(f32(word & 0xFFFFu), f32(word >> 16u)) / 65535.0 * 2.0 - 1.0;
    var v = vec3f(e, 1.0 - abs(e.x) - abs(e.y));
    let t = max(-v.z, 0.0);
    v.x += select(t, -t, v.x >= 0.0);
    v.y += select(t, -t, v.y >= 0.0);
    return normalize(v);
}

/** Um fim que escapa: a origem relativa a `anchor` (a câmera), a direção e o peso (meias precisões; a direção em 32 bits). */
struct RefractionEscape {
    offset: vec3f,
    dir: vec3f,
    weight: vec3f,
}

/** O fim como fica guardado (o que `refraction_ends_get` devolve): a luz do traçado se calcula com ele. */
fn refraction_ends_stored(e: RefractionEscape) -> RefractionEscape {
    let a = unpack2x16float(pack2x16float(clamp(e.offset.xy, vec2f(-65000.0), vec2f(65000.0))));
    let b = unpack2x16float(pack2x16float(vec2f(clamp(e.offset.z, -65000.0, 65000.0), min(e.weight.r, 65000.0))));
    let c = unpack2x16float(pack2x16float(min(e.weight.gb, vec2f(65000.0))));
    return RefractionEscape(vec3f(a, b.x), refraction_ends_dir(refraction_ends_oct(e.dir)), vec3f(b.y, c));
}

/** Guarda o fim `e` na vaga `k` do registro em `at` (peso 0: a vaga sem fim que escapa). */
fn refraction_ends_put(at: u32, k: u32, e: RefractionEscape) {
    let w = at + 4u * k;
    atomicStore(&refraction_ends[w], pack2x16float(clamp(e.offset.xy, vec2f(-65000.0), vec2f(65000.0))));
    atomicStore(&refraction_ends[w + 1u],
        pack2x16float(vec2f(clamp(e.offset.z, -65000.0, 65000.0), min(e.weight.r, 65000.0))));
    atomicStore(&refraction_ends[w + 2u], pack2x16float(min(e.weight.gb, vec2f(65000.0))));
    atomicStore(&refraction_ends[w + 3u], refraction_ends_oct(e.dir));
}

/** O fim da vaga `k` do registro em `at`. */
fn refraction_ends_get(at: u32, k: u32) -> RefractionEscape {
    let w = at + 4u * k;
    let a = unpack2x16float(atomicLoad(&refraction_ends[w]));
    let b = unpack2x16float(atomicLoad(&refraction_ends[w + 1u]));
    let c = unpack2x16float(atomicLoad(&refraction_ends[w + 2u]));
    return RefractionEscape(vec3f(a, b.x), refraction_ends_dir(atomicLoad(&refraction_ends[w + 3u])), vec3f(b.y, c));
}

/** Fecha o registro em `at`: a luz que fica (`rest`, a do caminho menos a dos fins que escapam) e o quadro do traçado. */
fn refraction_ends_close(at: u32, rest: vec3f) {
    let w = at + 4u * REFRACTION_ENDS_SLOTS;
    atomicStore(&refraction_ends[w], bitcast<u32>(rest.r));
    atomicStore(&refraction_ends[w + 1u], bitcast<u32>(rest.g));
    atomicStore(&refraction_ends[w + 2u], bitcast<u32>(rest.b));
    atomicStore(&refraction_ends[w + 3u], refraction.frame + 1u);
}

/** A luz que fica do registro em `at`. */
fn refraction_ends_rest(at: u32) -> vec3f {
    let w = at + 4u * REFRACTION_ENDS_SLOTS;
    return vec3f(bitcast<f32>(atomicLoad(&refraction_ends[w])), bitcast<f32>(atomicLoad(&refraction_ends[w + 1u])),
        bitcast<f32>(atomicLoad(&refraction_ends[w + 2u])));
}

/** O quadro + 1 do traçado do registro em `at` (o do carimbo do pixel quando o registro é o dele). */
fn refraction_ends_tag(at: u32) -> u32 {
    return atomicLoad(&refraction_ends[at + 4u * REFRACTION_ENDS_SLOTS + 3u]);
}
