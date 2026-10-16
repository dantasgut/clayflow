// Contagem de um conjunto lida na GPU (spec 031, R10): o número de elementos do registro `SetCount` de índice `index`,
// escrito por um nó no próprio fluxo, reduzido `depth` vezes por ⌈c / 256⌉ — a contagem do nível `depth` de uma soma
// de prefixos ou de uma redução (nível 0 = a própria contagem; 0 continua 0 em todos os níveis).

fn set_count_level(index: u32, depth: u32) -> u32 {
    var n = set_counts[index].count;
    for (var d = 0u; d < depth; d++) {
        n = n / SCAN_GROUP + select(0u, 1u, n % SCAN_GROUP != 0u);
    }
    return n;
}
