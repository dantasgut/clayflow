// A luz das amostras da marcha da tela adiada (spec 041, T074): a implementação do ponto `cloud_sample_light` na marcha
// da tela. O grupo de raios pagava a luz dentro do laço pelo raio com mais amostras com nuvem (12,9 em média no perfil
// alto) e não pela média (7,1). Aqui a marcha junta as amostras do raio (`cloud_light_pending`: a distância no raio, o
// peso na soma do raio e a coluna do ambiente) e as põe em lugares seguidos da lista do quadro, reservados de uma vez pela
// contagem atômica (`cloud_light_args[3]`): um trecho quando o raio acaba (`cloud_light_end`) e um a cada
// `CLOUD_LIGHT_CHUNK` amostras juntadas. Cada lugar tem quatro palavras (`cloud_light_list_out`, uma camada cada): a
// distância, o peso, a coluna do ambiente e o raio da amostra (o bloco: x nos 16 bits de baixo, y nos de cima) — o ponto,
// a pegada do pixel e o cosseno com o sol o passe da luz refaz do raio (`cloud_light_samples.wgsl`), que calcula uma
// amostra por invocação e grava a luz dela no lugar das três primeiras palavras; a composição
// (`cloud_march_compose.wgsl`) soma as do raio a partir do último trecho dele. Um trecho que não é o primeiro do raio
// leva um lugar a mais, no fim, com o trecho anterior (o primeiro lugar e o código dele; o raio `CLOUD_LIGHT_LINK`, que o
// passe da luz pula). O código de um trecho: quantas amostras (até `CLOUD_LIGHT_CHUNK`) + `CLOUD_LIGHT_LINKED` se há
// anterior; 0 sem trecho. A lista é do quadro (a contagem zera no passe dos argumentos) e tem o teto do alvo dela (16
// lugares por raio na média: `CloudLayer.lightList`); o trecho que não cabe tem a luz das amostras dele calculada aqui
// mesmo, como no pronto — nenhuma fica sem luz.
// Requer: CLOUD_LIGHT_LIST_MAX, CLOUD_LIGHT_CHUNK, CLOUD_LIGHT_LINKED, CLOUD_LIGHT_LINK, cloud_light, cloud_sun_volume_lookup (a pegada), sky, cloud_light_list_out,
// cloud_light_args.

/** As amostras juntadas do raio da invocação: a distância no raio (m), o peso na soma do raio e a coluna do ambiente. */
var<private> cloud_light_pending: array<vec3f, CLOUD_LIGHT_CHUNK>;
var<private> cloud_light_pending_count: u32 = 0u;
/** O último trecho do raio na lista: o primeiro lugar e o código (0 sem nenhum). */
var<private> cloud_light_chunk: vec2u = vec2u(0u);
/** A luz das amostras dos trechos que não couberam na lista. */
var<private> cloud_light_unlisted: vec3f = vec3f(0.0);
/** O raio da invocação: o bloco, a origem, a direção e o ângulo do pixel da marcha (a pegada da amostra é `t·pixel`). */
var<private> cloud_light_block: vec2u = vec2u(0u);
var<private> cloud_light_origin: vec3f = vec3f(0.0);
var<private> cloud_light_dir: vec3f = vec3f(0.0);
var<private> cloud_light_pixel: f32 = 0.0;
var<private> cloud_light_steps: u32 = 0u;

/** O raio `o + t·d` do bloco `g` que a invocação vai marchar. */
fn cloud_light_begin(g: vec2u, o: vec3f, d: vec3f, pixel: f32, light_steps: u32) {
    cloud_light_block = g;
    cloud_light_origin = o;
    cloud_light_dir = d;
    cloud_light_pixel = pixel;
    cloud_light_steps = light_steps;
}

/** As amostras juntadas num trecho da lista; sem lugar, a luz delas calculada aqui. */
fn cloud_light_flush() {
    let n = min(cloud_light_pending_count, CLOUD_LIGHT_CHUNK);
    cloud_light_pending_count = 0u;
    if (n == 0u) { return; }
    let size = textureDimensions(cloud_light_list_out);
    let linked = cloud_light_chunk.y != 0u;
    let places = n + select(0u, 1u, linked);
    let first = atomicAdd(&cloud_light_args[3], places);
    if (first + places > min(size.x * size.y, CLOUD_LIGHT_LIST_MAX)) {
        let cos_theta = dot(cloud_light_dir, sky.sunDirection.xyz);
        for (var k = 0u; k < CLOUD_LIGHT_CHUNK; k++) {
            if (k >= n) { break; }
            let s = cloud_light_pending[k];
            cloud_light_footprint = s.x * cloud_light_pixel;
            cloud_light_unlisted += s.y * cloud_radiance(
                cloud_light_origin + cloud_light_dir * s.x,
                cos_theta,
                cloud_light_steps,
                s.z,
            );
        }
        return;
    }
    let ray = cloud_light_block.x | (cloud_light_block.y << 16u);
    for (var k = 0u; k < CLOUD_LIGHT_CHUNK; k++) {
        if (k >= n) { break; }
        let s = cloud_light_pending[k];
        let slot = first + k;
        let at = vec2u(slot % size.x, slot / size.x);
        textureStore(cloud_light_list_out, at, 0u, vec4u(bitcast<u32>(s.x), 0u, 0u, 0u));
        textureStore(cloud_light_list_out, at, 1u, vec4u(bitcast<u32>(s.y), 0u, 0u, 0u));
        textureStore(cloud_light_list_out, at, 2u, vec4u(bitcast<u32>(s.z), 0u, 0u, 0u));
        textureStore(cloud_light_list_out, at, 3u, vec4u(ray, 0u, 0u, 0u));
    }
    if (linked) {
        let slot = first + n;
        let at = vec2u(slot % size.x, slot / size.x);
        textureStore(cloud_light_list_out, at, 0u, vec4u(cloud_light_chunk.x, 0u, 0u, 0u));
        textureStore(cloud_light_list_out, at, 1u, vec4u(cloud_light_chunk.y, 0u, 0u, 0u));
        textureStore(cloud_light_list_out, at, 3u, vec4u(CLOUD_LIGHT_LINK, 0u, 0u, 0u));
    }
    cloud_light_chunk = vec2u(first, n + select(0u, CLOUD_LIGHT_LINKED, linked));
}

fn cloud_sample_light(p: vec3f, t: f32, cos_theta: f32, light_steps: u32, occ: f32, weight: f32) -> vec3f {
    if (cloud_light_pending_count >= CLOUD_LIGHT_CHUNK) { cloud_light_flush(); }
    cloud_light_pending[cloud_light_pending_count] = vec3f(t, weight, occ);
    cloud_light_pending_count++;
    return vec3f(0.0);
}

struct CloudLightRay {
    /** O último trecho do raio na lista: o primeiro lugar e o código (0 sem nenhum). */
    chunk: vec2u,
    /** A luz das amostras do raio que não couberam na lista (calculada na marcha). */
    unlisted: vec3f,
}

/** O fim do raio: as amostras juntadas na lista e o que a composição lê dele. */
fn cloud_light_end() -> CloudLightRay {
    cloud_light_flush();
    return CloudLightRay(cloud_light_chunk, cloud_light_unlisted);
}
