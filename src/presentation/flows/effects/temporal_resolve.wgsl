// Resolução temporal (spec 034, R3): a cor da cena deste quadro (com a amostra deslocada dentro do pixel) somada ao
// histórico reprojetado. A posição do ponto do pixel no quadro anterior vem do vetor de movimento do objeto (passe de
// movimento do forward) ou, no fundo, da câmera; o histórico é lido com Catmull–Rom (5 leituras bilineares). Desoclusão
// (a distância à câmera guardada no quadro anterior difere em mais de 5 %), corte de câmera, primeiro quadro e ponto
// que sai da tela recomeçam o histórico. Parado na tela, sem recorte: o detalhe menor que o pixel converge para a
// integral do pixel. Perto de movimento, a caixa da variância da vizinhança 3 × 3 recorta o histórico, e o quadro atual
// entra reconstruído das amostras vizinhas. Média exponencial na radiância linear, sem viés. No modo de acumulação, média
// uniforme dos quadros desde o corte, sem recorte (a referência de imagem parada). O alfa guarda quantos quadros o
// histórico tem. Parado, a luz direta que chega ao ponto (o alvo da luz da cena: a radiância sobre a refletância, sem a
// textura) comparada à do quadro anterior separa a mudança de iluminação — a sombra ou a luz que passa sobre a superfície
// parada — do detalhe menor que o pixel: o histórico é reiluminado pela razão da luz total e tratado como em movimento.
// A máscara reativa (`taa_reactive`, no modo temporal) recomeça o histórico onde o que o pixel mostra mudou sem que o
// vetor de movimento o leve até lá: o conteúdo visto pelo vidro, cuja imagem a lente desloca e inverte.
// Requer: fullscreen, CameraMatrices (cameras), taa_params, src_tex (cor), taa_light (r direta, g total), taa_history,
// taa_history_distance, taa_history_light, taa_depth, taa_motion, taa_reactive, src_smp.

const TAA_ACCUMULATE: u32 = 3u;
/**
 * Peso mínimo do quadro novo no modo temporal: parado, ≈ 64 quadros de memória (a média cobre a sequência inteira de 64
 * posições da amostra); em movimento, ≈ 10 (responde rápido ao que muda).
 */
const TAA_MIN_ALPHA_STILL: f32 = 1.0 / 64.0;
const TAA_MIN_ALPHA_MOVING: f32 = 0.25;
/** Largura da caixa da variância (desvios-padrão) com o ponto em movimento na tela. */
const TAA_GAMMA_MOVING: f32 = 1.0;
/**
 * Piso da caixa (fração do brilho médio da vizinhança): num eixo sem variância (a croma de uma região cinza), o
 * arredondamento do histórico não pode bastar para recortá-lo inteiro para a média.
 */
const TAA_CLIP_FLOOR: f32 = 0.01;
/**
 * Em movimento, o quadro atual entra reconstruído das amostras 3 × 3 (cada uma no seu ponto deslocado), pesadas por
 * uma gaussiana da distância ao centro do pixel (ajuste da Blackman–Harris de raio 1,5 px): o histórico curto não
 * integra o serrilhado de uma amostra pontual.
 */
const TAA_FILTER_SHARPNESS: f32 = 4.0;
/**
 * Mudança de iluminação: a luz que chegava ao pixel no quadro anterior fora da faixa da vizinhança 3 × 3 de agora por
 * mais que esta fração (o dobro: inteira). Abaixo, a variação da amostra deslocada numa penumbra ou numa aresta.
 */
const TAA_LIGHT_CHANGE: f32 = 0.1;
/** Quadros máximos do histórico no modo de acumulação. */
const TAA_MAX_FRAMES: f32 = 4096.0;

/** Histórico em `uv` por Catmull–Rom com 5 leituras bilineares (Jimenez 2016). */
fn taa_history_catmull(uv: vec2f, size: vec2f) -> vec4f {
    let pos = uv * size;
    let center = floor(pos - 0.5) + 0.5;
    let f = pos - center;
    let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    let w3 = f * f * (-0.5 + 0.5 * f);
    let w12 = w1 + w2;
    let tc12 = (center + w2 / w12) / size;
    let tc0 = (center - 1.0) / size;
    let tc3 = (center + 2.0) / size;
    var sum = vec4f(0.0);
    sum += textureSampleLevel(taa_history, src_smp, vec2f(tc12.x, tc0.y), 0.0) * (w12.x * w0.y);
    sum += textureSampleLevel(taa_history, src_smp, vec2f(tc0.x, tc12.y), 0.0) * (w0.x * w12.y);
    sum += textureSampleLevel(taa_history, src_smp, tc12, 0.0) * (w12.x * w12.y);
    sum += textureSampleLevel(taa_history, src_smp, vec2f(tc3.x, tc12.y), 0.0) * (w3.x * w12.y);
    sum += textureSampleLevel(taa_history, src_smp, vec2f(tc12.x, tc3.y), 0.0) * (w12.x * w3.y);
    let weight = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
    return max(sum / weight, vec4f(0.0));
}

/**
 * Onde o ponto do pixel estava no quadro anterior (uv): o vetor de movimento do objeto; no fundo, pela câmera. `behind`:
 * onde estava o que está atrás dele (difere só sob um transmissivo, que mostra o que está atrás).
 */
struct TaaReprojection {
    prev_uv: vec2f,
    world: vec3f,
    depth: f32,
    behind_uv: vec2f,
}

fn taa_reproject(pixel: vec2i, uv: vec2f) -> TaaReprojection {
    let cam = cameras[taa_params.cameraSlot];
    let depth = textureLoad(taa_depth, pixel, 0);
    let ndc = uv_to_ndc(uv);
    let world_h = projective_inverse(cam.unjitteredViewProjection) * vec4f(ndc, depth, 1.0);
    let world = world_h.xyz / world_h.w;
    let motion = textureLoad(taa_motion, pixel, 0);
    var prev_uv = uv + motion.xy;
    if (depth >= 1.0) {
        let prev = cam.previousViewProjection * vec4f(world, 1.0);
        prev_uv = ndc_to_uv(prev.xy / prev.w);
    }
    return TaaReprojection(prev_uv, world, depth, uv + motion.zw);
}

/**
 * Quanto o pixel se move na tela: 0 parado (abaixo de 0,01 pixel por quadro), 1 a partir de 0,1 pixel — com o histórico
 * reamostrado a cada quadro numa posição fracionária, o histórico longo de parado só vale sem movimento. Conta o maior
 * movimento num raio de 4 pixels (5 × 5 pontos a cada 2): a borda de um objeto parado tem amostras do que passa atrás
 * ou ao lado, e o que um objeto descobre ao começar a andar fica a até um passo dele. Sob um transmissivo, conta também
 * o movimento do que está atrás (a cor dele muda mesmo com a superfície parada).
 */
fn taa_moving(r: TaaReprojection, pixel: vec2i, uv: vec2f, size: vec2f) -> f32 {
    var m = max(length((r.prev_uv - uv) * size), length((r.behind_uv - uv) * size));
    let dims = vec2i(size);
    for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
            let q = clamp(pixel + 2 * vec2i(dx, dy), vec2i(0), dims - 1);
            let v = textureLoad(taa_motion, q, 0);
            m = max(m, max(length(v.xy * size), length(v.zw * size)));
        }
    }
    return smoothstep(0.01, 0.1, m);
}

struct TaaOut {
    @location(0) color: vec4f,
    /**
     * Distância da câmera ao ponto do pixel, quanto ele se movia (a desoclusão do quadro seguinte) e os quadros do
     * histórico (em 32 bits: exatos até `TAA_MAX_FRAMES`; spec 037).
     */
    @location(1) state: vec4f,
    /**
     * A luz que chega ao ponto do pixel (direta, total), acumulada com os pesos da cor (a mudança de iluminação do quadro
     * seguinte).
     */
    @location(2) light: vec2f,
}

@fragment
fn fs_temporal_resolve(in: VsOut) -> TaaOut {
    let dims = textureDimensions(src_tex, 0);
    let size = vec2f(dims);
    let pixel = vec2i(in.clip_position.xy);
    let current = textureLoad(src_tex, pixel, 0).rgb;
    let light = textureLoad(taa_light, pixel, 0).rg;
    let cam = cameras[taa_params.cameraSlot];
    let r = taa_reproject(pixel, in.uv);
    let depth = r.depth;
    let prev_uv = r.prev_uv;
    // No fundo, o ponto no plano distante.
    let distance = length(r.world - cam.position.xyz);
    let inside = all(prev_uv >= vec2f(0.0)) && all(prev_uv <= vec2f(1.0));
    let history = taa_history_catmull(prev_uv, size);
    let moving = taa_moving(r, pixel, in.uv, size);
    // Desoclusão: o que estava ali no quadro anterior era outra superfície (distância diferente em mais de 5 %). Com tudo
    // parado em volta (neste quadro e no anterior), vale qualquer ponto da vizinhança 3 × 3 anterior: na silhueta, a
    // amostra deslocada cai ora num objeto, ora no que está atrás, e o pixel não recomeça a cada quadro. Com movimento,
    // só o ponto reprojetado: o que um objeto deixa para trás recomeça — também quando ele some atrás de outro, pelo
    // movimento guardado do quadro anterior.
    let prev_pixel = clamp(vec2i(prev_uv * size), vec2i(0), vec2i(dims) - 1);
    let prev_moving = textureLoad(taa_history_distance, prev_pixel, 0).g;
    // Movimento agora ou no quadro anterior: no quadro em que um objeto some (atrás de outro), o que ele deixou no
    // histórico ainda é recortado.
    var stirred = max(moving, prev_moving);
    let reach = select(1, 0, stirred > 0.0);
    var occluded = true;
    for (var dy = -reach; dy <= reach; dy++) {
        for (var dx = -reach; dx <= reach; dx++) {
            let q = clamp(prev_pixel + vec2i(dx, dy), vec2i(0), vec2i(dims) - 1);
            let prev_distance = textureLoad(taa_history_distance, q, 0).r;
            if (abs(prev_distance - distance) <= 0.05 * distance) { occluded = false; }
        }
    }
    // O conteúdo traçado mudou (máscara reativa): como uma desoclusão. Na acumulação ninguém a escreve.
    let reacted = taa_params.mode != TAA_ACCUMULATE && textureLoad(taa_reactive, pixel, 0).r > 0.5;
    let prev_frames = textureLoad(taa_history_distance, prev_pixel, 0).b;
    let frames = select(0.0, prev_frames, inside && !occluded && !reacted && !temporal_cut(cam.history));
    var out: TaaOut;
    out.state = vec4f(distance, moving, 0.0, 0.0);
    if (taa_params.mode == TAA_ACCUMULATE) {
        out.light = light;
        let n = min(frames, TAA_MAX_FRAMES - 1.0);
        out.color = vec4f(select(current, mix(history.rgb, current, temporal_weight_count(n, TAA_MAX_FRAMES)), n > 0.0), 1.0);
        out.state.z = n + 1.0;
        return out;
    }
    // Em movimento (perto de algo que se move), a caixa da variância da vizinhança 3 × 3 em YCoCg (Salvi) recorta o
    // histórico (o que saiu do pixel não deixa rastro). Parado, sem recorte: o histórico de um detalhe menor que o pixel
    // converge para a integral do pixel. A caixa e a reconstrução só com as amostras da mesma superfície do centro (a
    // profundidade de vista a até 5 %, o critério da desoclusão): a amostra de um objeto vizinho (um sprite, a borda de
    // outro objeto) não entra na cor do fundo nem alarga a caixa que recorta o que ele deixou.
    let center_depth = view_depth(depth, cam.projection);
    var m1 = vec3f(0.0);
    var m2 = vec3f(0.0);
    var count = 0.0;
    var filtered = vec3f(0.0);
    var wsum = 0.0;
    var light_lo = light.r;
    var light_hi = light.r;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let q = clamp(pixel + vec2i(dx, dy), vec2i(0), vec2i(dims) - 1);
            let rgb = textureLoad(src_tex, q, 0).rgb;
            let direct = textureLoad(taa_light, q, 0).r;
            // A faixa da luz com todos os vizinhos: numa silhueta, a amostra deslocada cai ora numa superfície, ora na
            // outra, e a luz acumulada é a mistura das duas.
            light_lo = min(light_lo, direct);
            light_hi = max(light_hi, direct);
            // Só em movimento a caixa e a reconstrução valem: parado, sem as leituras da profundidade.
            if (stirred > 0.0) {
                let near = view_depth(textureLoad(taa_depth, q, 0), cam.projection);
                if (abs(near - center_depth) > 0.05 * center_depth) { continue; }
            }
            let c = ycocg(rgb);
            m1 += c;
            m2 += c * c;
            count += 1.0;
            // A amostra do vizinho caiu em (vizinho − deslocamento): o peso é o da distância dela ao centro, dividido por
            // (1 + brilho) — uma amostra muito clara (uma luz, radiância ≫ 1) não domina o pixel vizinho, que o
            // histórico guardaria depois que ela passa.
            let o = vec2f(f32(dx), f32(dy)) - cam.jitter.zw;
            let w = exp(-TAA_FILTER_SHARPNESS * dot(o, o)) / (1.0 + c.x);
            filtered += rgb * w;
            wsum += w;
        }
    }
    // Mudança de iluminação na superfície (não no fundo): a luz direta acumulada com o histórico fora da faixa da
    // vizinhança de agora. O histórico é reiluminado pela razão da luz total (a textura integrada fica; a sombra que
    // passou sai, a luz rebatida fica) e, como em movimento, recortado com o quadro novo entrando depressa.
    let prev_light = textureLoad(taa_history_light, prev_pixel, 0).rg;
    let beyond = max(prev_light.r - light_hi, light_lo - prev_light.r) / max(max(light_hi, prev_light.r), 1e-4);
    let relit = select(0.0, smoothstep(TAA_LIGHT_CHANGE, 2.0 * TAA_LIGHT_CHANGE, beyond), frames > 0.0 && depth < 1.0);
    let ratio = clamp(light.g / max(prev_light.g, 1e-4), 0.0, 16.0);
    let relighted = history.rgb * mix(1.0, ratio, relit);
    stirred = max(stirred, relit);
    let reconstructed = mix(current, filtered / wsum, stirred);
    let mean = m1 / count;
    let sigma = sqrt(max(m2 / count - mean * mean, vec3f(0.0)));
    let floor_extent = vec3f(TAA_CLIP_FLOOR * max(mean.x, 1e-4));
    let extent = max(TAA_GAMMA_MOVING * sigma, floor_extent);
    let d = ycocg(relighted) - mean;
    let scale = max(abs(d) / extent, vec3f(1.0));
    let clipped = mix(relighted, ycocg_inverse(mean + d / max(scale.x, max(scale.y, scale.z))), stirred);
    // Média exponencial na radiância linear (sem peso por luminância: a média fica sem viés).
    let alpha = max(1.0 / (frames + 1.0), mix(TAA_MIN_ALPHA_STILL, TAA_MIN_ALPHA_MOVING, stirred));
    out.color = vec4f(select(reconstructed, mix(clipped, reconstructed, alpha), frames > 0.0), 1.0);
    out.state.z = min(frames + 1.0, TAA_MAX_FRAMES);
    // A luz acumulada como a cor: reiluminada, ela é a de agora.
    out.light = select(light, mix(mix(prev_light, light, relit), light, alpha), frames > 0.0);
    return out;
}

/** Nitidez máxima (em movimento): o peso da diferença para a média em cruz. */
const TAA_SHARPEN: f32 = 0.7;

/**
 * Nitidez adaptativa depois da resolução (spec 034, decisão do usuário): em movimento, a reamostragem do histórico a
 * cada quadro amacia a imagem; a diferença do pixel para a média em cruz é somada de volta, proporcional ao movimento
 * do pixel e limitada aos extremos da cruz (sem halo). Parado, a imagem resolvida passa intacta. O histórico fica sem
 * a nitidez (a próxima resolução não a acumula).
 */
fn taa_sharpened(pixel: vec2i) -> vec3f {
    let dims = vec2i(textureDimensions(taa_history, 0));
    let c = textureLoad(taa_history, pixel, 0).rgb;
    // O movimento do pixel, já medido pela resolução deste quadro (o estado que ela acabou de escrever).
    let k = TAA_SHARPEN * textureLoad(taa_history_distance, pixel, 0).g;
    if (k <= 0.0) { return c; }
    let n = textureLoad(taa_history, clamp(pixel + vec2i(0, -1), vec2i(0), dims - 1), 0).rgb;
    let s = textureLoad(taa_history, clamp(pixel + vec2i(0, 1), vec2i(0), dims - 1), 0).rgb;
    let w = textureLoad(taa_history, clamp(pixel + vec2i(-1, 0), vec2i(0), dims - 1), 0).rgb;
    let e = textureLoad(taa_history, clamp(pixel + vec2i(1, 0), vec2i(0), dims - 1), 0).rgb;
    let lo = min(c, min(min(n, s), min(w, e)));
    let hi = max(c, max(max(n, s), max(w, e)));
    let sharp = c + k * (c - 0.25 * (n + s + w + e));
    return clamp(sharp, lo, hi);
}

/** A imagem resolvida com a nitidez, em HDR, para os efeitos de pós. */
@fragment
fn fs_temporal_sharpen(in: VsOut) -> @location(0) vec4f {
    return vec4f(taa_sharpened(vec2i(in.clip_position.xy)), 1.0);
}
