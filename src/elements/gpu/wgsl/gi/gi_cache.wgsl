// Cache de irradiância nas superfícies (spec 034, T059; o cache de radiância no espaço do mundo do Lumen e o SHaRC da
// NVIDIA): a luz rebatida num acerto, lida no próprio ponto. As sondas do mundo dão a irradiância no ponto delas, fora
// do plano da superfície — no teto de um cômodo, a camada de sondas de cima fica 0,35 m abaixo dele e mais perto da
// mancha de sol do chão: medido no cômodo com janela, +8 a +24 % por face só com elas. O cache guarda, por célula na
// superfície (a posição em níveis que dobram com a distância à câmera e a normal em 16 direções), a irradiância de cada
// rebatimento medida por raios que partem do ponto da célula — o ponto do acerto que a criou.
// Dois buffers, as duas séries por páginas da spec 037 (uma página por célula; a validade é a época da série das sondas,
// gravada na célula): o índice (`gi_cache`, palavras atômicas — a chave, 0 = vazia; a época; o último quadro em que um
// acerto usou a célula; a normal, o ponto e o lado) e os valores (`gi_cache_data`, lidos sem atômicos por quem soma os
// rebatimentos — a chave e a época para que foram acumulados, o estado da resposta e a irradiância de cada rebatimento,
// em palavras inteiras: a chave não passa por um f32).
// A tabela é de espalhamento aberto com sondagem limitada (`GI_CACHE_PROBE` posições); a célula sem uso há
// `GI_CACHE_EVICT` quadros pode ser tomada por outra chave. As células usadas há pouco são atualizadas em rodízio
// (`gi_cache_select_main`), os raios delas vão na rodada da onda com os das sondas (`gi_cache_trace`) e o acúmulo tem a
// histerese adaptativa das sondas (`gi_cache_blend_main`).
// Requer: WORKGROUP_SIZE, NONE, random, gi, gi_common, gi_response, cameras, gi_probe_clock, gi_cache, gi_cache_data,
// gi_cache_data_read, gi_cache_list, gi_cache_list_read, gi_cache_fresh_read.

/** Posições sondadas a partir da posição da chave (a busca e a inserção). */
const GI_CACHE_PROBE: u32 = 8u;
/** Quadros sem uso depois dos quais a célula pode ser tomada por outra chave. */
const GI_CACHE_EVICT: u32 = 120u;
/** Quadros desde o último uso em que a célula ainda é atualizada. */
const GI_CACHE_RECENT: u32 = 2u;
/** Palavras do índice por célula (a do TS: `GI_CACHE_WORDS`). */
const GI_CACHE_WORDS: u32 = 8u;
/**
 * Quadros acumulados desde a última mudança a partir dos quais a célula vale para quem lê (spec 034, T059): a célula
 * nova, ou a que viu a luz mudar, ainda junta os rebatimentos encadeados das vizinhas (cada um, um quadro depois) — até
 * lá, quem lê fica com as sondas de tela e as do mundo, que acompanham a mudança em poucos quadros.
 */
const GI_CACHE_STEADY: f32 = 16.0;
/** vec4f dos valores por célula (a do TS: `GI_CACHE_DATA`): a chave e a época, o estado e 8 rebatimentos. */
const GI_CACHE_DATA: u32 = 10u;

/** A chave de um ponto: a chave (nunca 0), a primeira posição na tabela e o lado da célula. */
struct GiCacheKey {
    key: u32,
    start: u32,
    size: f32,
}

fn gi_cache_key(p: vec3f, n: vec3f) -> GiCacheKey {
    let base = gi.cacheSize.x;
    let d = length(p - cameras[gi.screen.w].position.xyz);
    // O nível dobra o lado a cada dobro da distância além de `cacheSize.y` lados (a célula do tamanho que a tela resolve).
    let level = u32(clamp(floor(log2(max(d / (gi.cacheSize.y * base), 1.0))), 0.0, 15.0));
    let size = base * exp2(f32(level));
    let c = bitcast<vec3u>(vec3i(floor(p / size)));
    let o = min(vec2u((gi_oct_encode(n) * 0.5 + 0.5) * 4.0), vec2u(3u));
    let h = pcg_hash(hash3(c) ^ ((level | ((o.x + 4u * o.y) << 4u)) * 0x9e3779b9u));
    return GiCacheKey(h | 1u, pcg_hash(h ^ 0x85ebca6bu) % gi.cache.x, size);
}

fn gi_cache_at(cell: u32, word: u32) -> u32 {
    return cell * GI_CACHE_WORDS + word;
}

/** A célula vale na época atual da série das sondas. */
fn gi_cache_current(cell: u32) -> bool {
    return atomicLoad(&gi_cache[gi_cache_at(cell, 1u)]) == gi_probe_clock.x;
}

/** Recomeça a célula no ponto `p` (normal `n`, lado `size`) na época atual; os valores recomeçam no acúmulo. */
fn gi_cache_reset(cell: u32, p: vec3f, n: vec3f, size: f32) {
    atomicStore(&gi_cache[gi_cache_at(cell, 1u)], gi_probe_clock.x);
    atomicStore(&gi_cache[gi_cache_at(cell, 2u)], gi.rays.y);
    atomicStore(&gi_cache[gi_cache_at(cell, 3u)], pack2x16snorm(gi_oct_encode(n)));
    atomicStore(&gi_cache[gi_cache_at(cell, 4u)], bitcast<u32>(p.x));
    atomicStore(&gi_cache[gi_cache_at(cell, 5u)], bitcast<u32>(p.y));
    atomicStore(&gi_cache[gi_cache_at(cell, 6u)], bitcast<u32>(p.z));
    atomicStore(&gi_cache[gi_cache_at(cell, 7u)], bitcast<u32>(size));
}

/** Marca a célula como usada no quadro (uma escrita por célula e quadro: os acertos na mesma célula só leem). */
fn gi_cache_use(cell: u32) {
    let at = gi_cache_at(cell, 2u);
    if (atomicLoad(&gi_cache[at]) != gi.rays.y) { atomicStore(&gi_cache[at], gi.rays.y); }
}

/**
 * A célula do ponto `p` (normal `n`), marcada como usada no quadro; com `insert`, criada se não existe (numa posição
 * vazia ou sem uso há `GI_CACHE_EVICT` quadros). NONE sem ela. A célula criada agora não tem acúmulo (`gi_cache_ready`).
 */
fn gi_cache_touch(p: vec3f, n: vec3f, insert: bool) -> u32 {
    if (gi.cache.w == 0u) { return NONE; }
    let k = gi_cache_key(p, n);
    let frame = gi.rays.y;
    var victim = NONE;
    var victim_key = 0u;
    var oldest = 0u;
    for (var q = 0u; q < GI_CACHE_PROBE; q++) {
        let cell = (k.start + q) % gi.cache.x;
        let key = atomicLoad(&gi_cache[gi_cache_at(cell, 0u)]);
        let current = key != 0u && gi_cache_current(cell);
        if (key == k.key) {
            // A mesma chave de uma época anterior (a série recomeçou): a célula recomeça no ponto.
            if (!current) { gi_cache_reset(cell, p, n, k.size); }
            gi_cache_use(cell);
            return cell;
        }
        let age = select(NONE, frame - atomicLoad(&gi_cache[gi_cache_at(cell, 2u)]), current);
        if (age > oldest) {
            oldest = age;
            victim = cell;
            victim_key = key;
        }
    }
    if (!insert || victim == NONE || oldest < GI_CACHE_EVICT) { return NONE; }
    let r = atomicCompareExchangeWeak(&gi_cache[gi_cache_at(victim, 0u)], victim_key, k.key);
    if (!r.exchanged) {
        // Outro acerto tomou a posição no mesmo quadro: com a mesma chave, é a célula.
        return select(NONE, victim, r.old_value == k.key);
    }
    gi_cache_reset(victim, p, n, k.size);
    return victim;
}

/** O primeiro vec4f dos valores da célula. */
fn gi_cache_data_at(cell: u32) -> u32 {
    return cell * GI_CACHE_DATA;
}

/**
 * A célula tem acúmulo para a chave que a ocupa na época atual (os valores de uma chave anterior, ou de uma época
 * anterior, não valem).
 */
fn gi_cache_ready(cell: u32) -> bool {
    if (cell == NONE) { return false; }
    let head = gi_cache_data_read[gi_cache_data_at(cell)];
    let key = atomicLoad(&gi_cache[gi_cache_at(cell, 0u)]);
    return head.x == key && head.y == gi_probe_clock.x
        && bitcast<vec4f>(gi_cache_data_read[gi_cache_data_at(cell) + 1u]).w >= GI_CACHE_STEADY;
}

/** Irradiância (E) do rebatimento `g` na célula. */
fn gi_cache_irradiance(cell: u32, g: u32) -> vec3f {
    return bitcast<vec4f>(gi_cache_data_read[gi_cache_data_at(cell) + 2u + g]).rgb;
}

/**
 * As células a atualizar no quadro: as da época atual usadas há até `GI_CACHE_RECENT` quadros, até `gi.cache.y` delas
 * (contador na palavra 0 da lista). O começo da varredura anda `gi.cache.y` células por quadro: com mais células em uso
 * que o orçamento, todas passam em rodízio.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_cache_select_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (j >= gi.cache.x || gi.cache.w == 0u) { return; }
    let cell = (j + gi.rays.y * gi.cache.y) % gi.cache.x;
    if (atomicLoad(&gi_cache[gi_cache_at(cell, 0u)]) == 0u || !gi_cache_current(cell)) { return; }
    if (gi.rays.y - atomicLoad(&gi_cache[gi_cache_at(cell, 2u)]) > GI_CACHE_RECENT) { return; }
    let slot = atomicAdd(&gi_cache_list[0], 1u);
    if (slot >= gi.cache.y) { return; }
    atomicStore(&gi_cache_list[1u + slot], cell);
}

/** Células na lista do quadro. */
fn gi_cache_listed() -> u32 {
    return min(gi_cache_list_read[0], gi.cache.y);
}

/**
 * O acúmulo das células atualizadas no quadro: a irradiância dos raios de cada rebatimento misturada à da célula pela
 * histerese adaptativa (a do acúmulo das sondas do mundo, `gi.tuning.x`, parada; a de resposta quando a luz muda). Os
 * valores de outra chave ou de outra época recomeçam.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn gi_cache_blend_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (slot >= gi_cache_listed()) { return; }
    let cell = gi_cache_list_read[1u + slot];
    let bounces = gi.bounces.x;
    // Todos os raios pela face de trás (a célula colada a uma superfície que a corta): nada a acumular.
    if (gi_cache_fresh_read[slot * bounces].w <= 0.0) { return; }
    let at = gi_cache_data_at(cell);
    let key = atomicLoad(&gi_cache[gi_cache_at(cell, 0u)]);
    let head = gi_cache_data[at];
    let same = head.x == key && head.y == gi_probe_clock.x;
    let state = select(vec4f(0.0), bitcast<vec4f>(gi_cache_data[at + 1u]), same);
    let last = gi_cache_fresh_read[slot * bounces + bounces - 1u].rgb;
    let response = gi_response(state, gi_response_value(last), gi.tuning.x);
    for (var g = 0u; g < bounces; g++) {
        let fresh = gi_cache_fresh_read[slot * bounces + g].rgb;
        let old = bitcast<vec4f>(gi_cache_data[at + 2u + g]).rgb;
        gi_cache_data[at + 2u + g] = bitcast<vec4u>(vec4f(mix(fresh, old, response.h), 0.0));
    }
    gi_cache_data[at + 1u] = bitcast<vec4u>(response.state);
    gi_cache_data[at] = vec4u(key, gi_probe_clock.x, 0u, 0u);
}
