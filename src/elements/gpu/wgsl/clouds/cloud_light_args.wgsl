// Os argumentos do despacho indireto do passe da luz das amostras da marcha (spec 041, T074): uma invocação, depois da
// marcha — os grupos da lista do quadro (`cloud_light_args[0..2]`), a contagem dela limitada ao teto (`[4]`, o que o
// passe da luz lê) e a contagem zerada (`[3]`) para a marcha do quadro seguinte.
// Despacho linear (como o `invocations` da C2): grupos em x até 65 535, o resto em y.
// Requer: WORKGROUP_SIZE, CLOUD_LIGHT_LIST_MAX, cloud_light_list_a (o tamanho), cloud_light_args.

@compute @workgroup_size(1)
fn cloud_light_args_main() {
    let size = textureDimensions(cloud_light_list_a);
    let count = min(atomicExchange(&cloud_light_args[3], 0u), min(size.x * size.y, CLOUD_LIGHT_LIST_MAX));
    let groups = (count + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;
    let x = min(groups, 65535u);
    atomicStore(&cloud_light_args[0], x);
    atomicStore(&cloud_light_args[1], select(0u, (groups + x - 1u) / max(x, 1u), groups > 0u));
    atomicStore(&cloud_light_args[2], select(0u, 1u, groups > 0u));
    atomicStore(&cloud_light_args[4], count);
}
