// Os argumentos do despacho indireto do desenho do mapa visto do sol (spec 041, T074): os grupos das páginas que a escolha
// do quadro listou (`cloud_shadow_work[0]` a contagem), `CLOUD_SHADOW_DRAW_ROWS` por página. Num buffer à parte: o
// desenho liga `cloud_shadow_work` para escrita (o mesmo módulo da escolha), e o buffer do despacho indireto não pode
// estar ligado para escrita no mesmo passe.
// Requer: CLOUD_SHADOW_DRAW_ROWS, cloud_shadow_work, cloud_shadow_args.

@compute @workgroup_size(1)
fn cloud_shadow_args_main() {
    cloud_shadow_args[0] = atomicLoad(&cloud_shadow_work[0]) * CLOUD_SHADOW_DRAW_ROWS;
    cloud_shadow_args[1] = 1u;
    cloud_shadow_args[2] = 1u;
}
