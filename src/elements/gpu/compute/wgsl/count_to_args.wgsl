// Contagem → argumentos indiretos (spec 031, R10): lê a contagem do registro `SetCount` de índice `p.index` e escreve,
// no mesmo registro, o despacho linear de `count` invocações em grupos de `p.group_size` (dividido em x/y como
// `Dispatcher.invocations`, até `p.max_x` grupos em x) e o desenho: `count · per_element` índices numa instância, ou,
// instanciado, `per_element` índices em `count` instâncias.

@compute @workgroup_size(1)
fn count_to_args_main() {
    let n = set_counts[p.index].count;
    let groups = (n + p.group_size - 1u) / p.group_size;
    let x = min(groups, p.max_x);
    set_counts[p.index].dispatch_x = x;
    set_counts[p.index].dispatch_y = select(1u, (groups + x - 1u) / x, x > 0u);
    set_counts[p.index].dispatch_z = 1u;
    let instanced = p.instanced != 0u;
    set_counts[p.index].index_count = select(n * p.per_element, p.per_element, instanced);
    set_counts[p.index].instance_count = select(p.instances, n, instanced);
    set_counts[p.index].first_index = 0u;
    set_counts[p.index].base_vertex = 0i;
    set_counts[p.index].first_instance = 0u;
}
