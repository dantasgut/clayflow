// Alocação de páginas em ordem (spec 034, T060/T060c): a soma de prefixos de um grupo de trabalho de 256 invocações,
// comum aos caches por páginas — o mapa de sombra virtual (as filas por nível, as livres, a alocação) e as texturas
// virtuais (as filas por nível, as livres em dois níveis). Com ela, a posição de cada página nas filas, nas livres e na
// alocação sai na ordem do índice: o que entra no orçamento do quadro não depende da ordem dos atômicos.

var<workgroup> pa_rank: array<u32, 256>;

/** Soma de prefixos inclusiva de `pa_rank` no grupo (Hillis–Steele); todas as invocações chamam. */
fn pa_scan(lid: u32) {
    workgroupBarrier();
    for (var d = 1u; d < 256u; d = d << 1u) {
        let v = select(0u, pa_rank[lid - d], lid >= d);
        workgroupBarrier();
        pa_rank[lid] += v;
        workgroupBarrier();
    }
}

/** A posição de `count` itens da invocação `lid` entre os do grupo (soma exclusiva); o total fica em `pa_rank[255]`. */
fn pa_exclusive(lid: u32, count: u32) -> u32 {
    workgroupBarrier();
    pa_rank[lid] = count;
    pa_scan(lid);
    return pa_rank[lid] - count;
}
