// A caixa dos vértices de uma geometria no espaço do objeto (spec 034, T060/T060d): a redução de um grupo de 256
// invocações sobre os vértices intercalados (8 palavras por vértice, a posição nas 3 primeiras) do buffer ligado ao
// despacho (`bounds_vertices`). Comum ao mapa de sombra virtual e ao descarte do desenho; cada um guarda a caixa no seu
// trabalho. Laço com teto constante.

/** Teto das rodadas da caixa por invocação (vértices = 256 × rodadas). */
const VERTEX_BOUNDS_ROUNDS: u32 = 65536u;

var<workgroup> vertex_bounds_lo: array<vec3f, 256>;
var<workgroup> vertex_bounds_hi: array<vec3f, 256>;

/**
 * A caixa (mínimo, máximo) dos vértices, igual em todas as invocações do grupo de 256 que a chamam juntas. Sem vértices,
 * a caixa vazia (mínimo acima do máximo).
 */
fn vertex_bounds(lid: u32) -> array<vec3f, 2> {
    let count = arrayLength(&bounds_vertices) / 8u;
    var lo = vec3f(3.0e38);
    var hi = vec3f(-3.0e38);
    for (var r = 0u; r < VERTEX_BOUNDS_ROUNDS; r++) {
        let v = lid + r * 256u;
        if (v >= count) { break; }
        let p = vec3f(bounds_vertices[v * 8u], bounds_vertices[v * 8u + 1u], bounds_vertices[v * 8u + 2u]);
        lo = min(lo, p);
        hi = max(hi, p);
    }
    vertex_bounds_lo[lid] = lo;
    vertex_bounds_hi[lid] = hi;
    workgroupBarrier();
    for (var s = 128u; s > 0u; s = s >> 1u) {
        if (lid < s) {
            vertex_bounds_lo[lid] = min(vertex_bounds_lo[lid], vertex_bounds_lo[lid + s]);
            vertex_bounds_hi[lid] = max(vertex_bounds_hi[lid], vertex_bounds_hi[lid + s]);
        }
        workgroupBarrier();
    }
    return array<vec3f, 2>(vertex_bounds_lo[0], vertex_bounds_hi[0]);
}
