// Os argumentos do despacho indireto de uma rodada da cadeia (spec 039 refeita): os grupos que cobrem as vagas vivas da
// lista corrente (`refraction_path_queue`, o cabeçalho de `refraction_chain.wgsl`), no máximo `REFRACTION_CHAIN_GROUPS`
// (os laços em passo de grade percorrem o resto). Gravado depois das raízes e de cada troca de listas; o acerto, o
// material da onda e a continuação leem os argumentos sem ligar este buffer. Sem vaga viva, nenhum grupo: a rodada vazia
// (e o bloco vazio) não custa o despacho da grade.
// Requer: WORKGROUP_SIZE, refraction_path_queue, refraction_path_args.

/** Grupos no máximo por despacho de rodada (os que bastam para ocupar a GPU). */
override REFRACTION_CHAIN_GROUPS: u32 = 512u;

@compute @workgroup_size(1)
fn refraction_chain_args_main() {
    let live = atomicLoad(&refraction_path_queue[3u + atomicLoad(&refraction_path_queue[2])]);
    refraction_path_args[0] = min((live + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE, REFRACTION_CHAIN_GROUPS);
    refraction_path_args[1] = 1u;
    refraction_path_args[2] = 1u;
}
