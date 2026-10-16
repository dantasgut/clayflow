// Nó de amostragem do campo da cena (spec 031, R12): a aceleração (m/s²) que os campos da cena — os prontos e as funções
// `field` — dão a um corpo (massa inversa, densidade, volume) na posição `x` com velocidade `v` no tempo `time`. É o
// ponto de cena `field`: a C2 troca o `field_accel` pronto pela composição da cena em todo shader que usa o nó. Não vale
// dentro de uma função `field` (a composição chamaria a si mesma).
// Requer: field_point_types; field_accel (pronto: `field_accel_ready`).

fn node_field_sample(
    x: vec3f,
    v: vec3f,
    time: f32,
    inv_mass: f32,
    density: f32,
    volume: f32,
) -> vec3f {
    return field_accel(x, v, time, FieldBody(inv_mass, density, volume, 0.0));
}
