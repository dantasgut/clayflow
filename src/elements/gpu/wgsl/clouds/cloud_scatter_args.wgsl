// Os argumentos dos despachos indiretos do cache de espalhamento (spec 041, T074): os caminhos — os grupos das páginas que
// a escolha do quadro listou (`cloud_scatter_work[0]`, `CLOUD_SCATTER_PAGE_PROBES` sondas cada; no quadro do transporte, os
// do orçamento, que o transporte percorre em rodadas) — e o filtro — a grade inteira quando alguma página foi marcada
// (`CLOUD_SCATTER_WORK_ANY`), nenhum grupo quando não. Sem página a caminhar nem marcada, os dois passes não despacham
// nada: o cache parado custava as invocações que só liam a contagem (0,09 ms no perfil alto). Num buffer à parte: o
// buffer do despacho indireto não pode estar ligado para escrita no passe que ele despacha.
// Despacho linear (como o `invocations` da C2): grupos em x até 65 535, o resto em y.
// Requer: WORKGROUP_SIZE, clouds, cloud_scatter_pages, cloud_scatter_work, cloud_scatter_args.

/** Os grupos de um despacho linear de `n` invocações nos argumentos a partir de `at`. */
fn cloud_scatter_groups(n: u32, at: u32) {
    let groups = (n + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;
    let x = min(groups, 65535u);
    cloud_scatter_args[at] = x;
    cloud_scatter_args[at + 1u] = select(0u, (groups + x - 1u) / max(x, 1u), groups > 0u);
    cloud_scatter_args[at + 2u] = select(0u, 1u, groups > 0u);
}

@compute @workgroup_size(1)
fn cloud_scatter_args_main() {
    let size = clouds_scatter_size();
    let carry = atomicLoad(&cloud_scatter_work[CLOUD_SCATTER_WORK_CARRY]) != 0u;
    let pages = select(atomicLoad(&cloud_scatter_work[0]), max(clouds.scatterWork.x, 1u), carry);
    cloud_scatter_groups(pages * CLOUD_SCATTER_PAGE_PROBES, 0u);
    let any = atomicLoad(&cloud_scatter_work[CLOUD_SCATTER_WORK_ANY]) != 0u;
    cloud_scatter_groups(select(0u, size.x * size.y * size.z, any), 4u);
}
