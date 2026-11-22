// A luz das amostras da marcha da tela adiada (spec 041, T074): a implementação do ponto `cloud_sample_light` na marcha
// da tela. O grupo de raios pagava a luz dentro do laço pelo raio com mais amostras com nuvem (12,9 em média no perfil
// alto) e não pela média (7,1). Aqui a amostra entra na lista do quadro pela contagem atômica (`cloud_light_args[3]`) — o
// ponto e o peso dela na soma do raio (`cloud_light_list_a_out`), a pegada do pixel, a coluna do ambiente, o cosseno com
// o sol e a amostra anterior do mesmo raio (`cloud_light_list_b_out`; −1 na primeira) — e o passe da luz
// (`cloud_light_samples.wgsl`) calcula uma amostra por invocação; a composição (`cloud_march_compose.wgsl`) soma as do
// raio a partir da última (`cloud_light_head`). A lista é do quadro (a contagem zera no passe dos argumentos) e tem o teto
// do alvo dela (16 amostras por raio: `CloudLayer.lightListA`); a amostra que não cabe tem a luz calculada aqui mesmo,
// como no pronto — nenhuma fica sem luz.
// Requer: CLOUD_LIGHT_LIST_MAX, cloud_light, cloud_sun_volume_lookup (a pegada), cloud_light_list_a_out,
// cloud_light_list_b_out, cloud_light_args.

/** A última amostra do raio da invocação na lista (o índice dela, exato em f32 até `CLOUD_LIGHT_LIST_MAX`); −1 sem nenhuma. */
var<private> cloud_light_head: f32 = -1.0;

fn cloud_sample_light(p: vec3f, cos_theta: f32, light_steps: u32, occ: f32, weight: f32) -> vec3f {
    let size = textureDimensions(cloud_light_list_a_out);
    let slot = atomicAdd(&cloud_light_args[3], 1u);
    if (slot >= min(size.x * size.y, CLOUD_LIGHT_LIST_MAX)) {
        return weight * cloud_radiance(p, cos_theta, light_steps, occ);
    }
    let at = vec2u(slot % size.x, slot / size.x);
    textureStore(cloud_light_list_a_out, at, vec4f(p, weight));
    textureStore(cloud_light_list_b_out, at, vec4f(cloud_light_footprint, occ, cos_theta, cloud_light_head));
    cloud_light_head = f32(slot);
    return vec3f(0.0);
}
