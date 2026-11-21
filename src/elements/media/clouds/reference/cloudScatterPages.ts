// Referência f64 do orçamento por necessidade do cache de espalhamento das nuvens e do panorama (spec 041, T074): a
// mudança do que um registro guarda desde o último caminho (o sol, a câmera, o vento que sobra além do referencial das
// nuvens, a evolução da forma, o conteúdo), a fila da página na escolha do quadro (a da mudança e a de encher a janela,
// cada uma no seu orçamento) e o panorama a refazer pela mudança medida nele. Espelho de `cloud_scatter_change`,
// `cloud_scatter_key` e `cloud_scatter_panorama_redo` em `cloud_scatter.wgsl`.
import type { Vec3 } from './cloudModel';
import {
    CLOUD_PANORAMA_TOLERANCE,
    CLOUD_SCATTER_SUN_MEMORY,
    CLOUD_SCATTER_VIEW_MEMORY,
} from '../schemas';

export { CLOUD_SCATTER_SUN_MEMORY, CLOUD_SCATTER_VIEW_MEMORY };
/** A fila da página que nunca caminhou nesta geração. */
export const CLOUD_SCATTER_KEY_FRESH = 31;
/** Peso (m) da distância do centro da página à câmera na fila (metade a esta distância). */
export const CLOUD_SCATTER_NEAR_WEIGHT = 32_000;

/** O que o último caminho (desenho) de um registro viu. */
export interface ScatterSeen {
    readonly sun: Vec3;
    readonly eye: Vec3;
    /** O tempo simulado (s). */
    readonly time: number;
    readonly signature: number;
}

/** O quadro de agora (o mesmo arranjo) e os parâmetros da mudança. */
export interface ScatterNow extends ScatterSeen {
    /** O tempo (s) em que a evolução da forma muda a transmitância de 1/e; 0 sem evolução. */
    readonly evolution: number;
    /**
     * O vento (m/s) que sobra além do referencial das nuvens, em que a grade das sondas anda (a bigorna levada pelo vento
     * de cima; 0 sem o tempo).
     */
    readonly extraWind: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
    const l = len(a);
    return [a[0] / l, a[1] / l, a[2] / l];
};

/** O ângulo (rad) entre duas direções unitárias pela corda. */
export function scatterAngle(a: Vec3, b: Vec3): number {
    return 2 * Math.asin(Math.min(Math.max(0.5 * len(sub(a, b)), 0), 1));
}

/**
 * O esquecimento da média das sondas desde o registro `seen` (T074): `e^(−(Δθ_sol/M_sol + Δθ_câmera/M_câmera))`, as
 * memórias pela sensibilidade medida da luz guardada a cada ângulo (`CLOUD_SCATTER_SUN_MEMORY`,
 * `CLOUD_SCATTER_VIEW_MEMORY`; `scatterMemory.test.ts`); o ângulo da câmera, o da direção dela ao ponto `at`.
 */
export function scatterForget(seen: ScatterSeen, now: ScatterNow, at: Vec3): number {
    const sun = scatterAngle(seen.sun, now.sun);
    const view = scatterAngle(unit(sub(at, seen.eye)), unit(sub(at, now.eye)));
    return Math.exp(-(sun / CLOUD_SCATTER_SUN_MEMORY + view / CLOUD_SCATTER_VIEW_MEMORY));
}

/**
 * A mudança (0…1, em frações da média das sondas) do que o registro `seen` guarda até o quadro `now`, num ponto `at`
 * com sondas espaçadas de `spacing` m: a maior entre o esquecimento pelo sol e pela câmera (`1 − scatterForget`), o vento
 * que sobra além do referencial das nuvens (o deslocamento pelo espaçamento), a evolução (o tempo pelo da evolução) e o
 * conteúdo (outra assinatura: 1). O vento das nuvens não entra: a grade anda com elas.
 */
export function scatterChange(
    seen: ScatterSeen,
    now: ScatterNow,
    at: Vec3,
    spacing: number,
): number {
    let c = 1 - scatterForget(seen, now, at);
    const dt = Math.max(now.time - seen.time, 0);
    c = Math.max(c, (now.extraWind * dt) / spacing);
    if (now.evolution > 0) c = Math.max(c, dt / now.evolution);
    if (seen.signature !== now.signature) c = 1;
    return Math.min(c, 1);
}

/** A página na fila: o que ela viu, se tem nuvem, os caminhos efetivos e o quadro do último caminho. */
export interface ScatterPage {
    readonly seen: ScatterSeen;
    readonly cloudy: boolean;
    readonly paths: number;
    readonly frame: number;
    /** A página vale nesta geração (carimbada na época atual). */
    readonly current: boolean;
}

/**
 * A fila da página (0: nada a fazer; 1…30 em oitavas; `CLOUD_SCATTER_KEY_FRESH`: nunca caminhou nesta geração): a
 * mudança desde o último caminho ou, com nuvem, a falta para encher a janela (`1 − caminhos/janela`), de pelo menos um
 * caminho da janela; a prioridade, a mudança em caminhos × os quadros desde o último × 1/8 sem nuvem × √(proximidade ×
 * 2 vista).
 */
export function scatterPageKey(
    page: ScatterPage,
    now: ScatterNow,
    frame: number,
    at: Vec3,
    spacing: number,
    window: number,
    visible: boolean,
): number {
    if (!page.current) return CLOUD_SCATTER_KEY_FRESH;
    let change = scatterChange(page.seen, now, at, spacing);
    if (page.cloudy) change = Math.max(change, 1 - page.paths / window);
    if (change * window < 1) return 0;
    const age = Math.max(frame - page.frame, 1);
    const d = Math.max(Math.abs(at[0] - now.eye[0]), Math.abs(at[2] - now.eye[2]));
    const near = 1 / (1 + d / CLOUD_SCATTER_NEAR_WEIGHT);
    const pr =
        change * window * age * (page.cloudy ? 1 : 0.125) * Math.sqrt(near * (visible ? 2 : 1));
    if (pr < 1) return 1;
    return Math.min(Math.max(1 + Math.floor(Math.log2(pr)), 1), CLOUD_SCATTER_KEY_FRESH - 1);
}

/**
 * A página caminha no orçamento da mudança (`scatter.motion`: o sol, a câmera, o vento que sobra, a evolução, o conteúdo
 * mudaram desde o último caminho dela), não no de encher a janela (`scatter.budget`: a nova e a parada que não encheu)? Com
 * o sol andando, a média esquece entre dois caminhos e os caminhos efetivos ficam abaixo da janela: a falta é da mudança
 * (o regime), e ela fica no orçamento da mudança.
 */
export function scatterPageMotion(
    page: ScatterPage,
    now: ScatterNow,
    at: Vec3,
    spacing: number,
): boolean {
    return page.current && scatterChange(page.seen, now, at, spacing) > CLOUD_SCATTER_STILL;
}

/** A mudança abaixo da qual a página conta como parada (o ruído dos ângulos refeitos em f32 na GPU, ~10⁻⁶). */
export const CLOUD_SCATTER_STILL = 1e-4;

/**
 * Os caminhos efetivos da página depois de um caminho com o esquecimento `forget` (o do sol): esquecidos junto com a
 * média das sondas e mais um, até a janela.
 */
export function scatterPagePaths(paths: number, forget: number, window: number): number {
    return Math.min(paths * forget + 1, window);
}

export { CLOUD_PANORAMA_TOLERANCE };

/**
 * A mudança medida do panorama (T074; espelho de `cloud_scatter_panorama_change`): as provas do quadro (texels refeitos
 * como o desenho os faria agora: a luminância e a transmitância) contra os mesmos texels do desenho guardado — a maior
 * entre a diferença da luz relativa à luz das provas (`Σ|ΔL| / ΣL`) e a diferença média da transmitância. A média, não a
 * maior: com o sol andando, o ruído de poucos caminhos das páginas do cache muda cada texel, e o que o panorama dá (o céu
 * tapado lido pelas sondas, pela refração, pelo reflexo) é a soma de muitos.
 */
export function scatterPanoramaChange(
    drawn: readonly (readonly [number, number])[],
    probes: readonly (readonly [number, number])[],
): number {
    if (probes.length === 0) return 0;
    let light = 0;
    let change = 0;
    let trans = 0;
    probes.forEach((v, k) => {
        light += Math.max(v[0], 0);
        change += Math.abs(v[0] - Math.max(drawn[k]![0], 0));
        trans += Math.abs(v[1] - drawn[k]![1]);
    });
    return Math.max(change / Math.max(light, 1e-30), trans / probes.length);
}

/**
 * O panorama a refazer: a série que não vale, outro conteúdo (a assinatura) ou a mudança medida nas provas passou da
 * tolerância. As páginas do cache que caminham não o refazem: a luz delas chega ao panorama quando a mudança medida pede.
 */
export function scatterPanoramaRedo(
    valid: boolean,
    sameContent: boolean,
    measured: number,
): boolean {
    return !valid || !sameContent || measured > CLOUD_PANORAMA_TOLERANCE;
}

/** O espaçamento (m) das sondas no plano na coordenada normalizada `a` ∈ (−1, 1) da grade de `n` sondas. */
export function scatterSpacing(x0: number, reach: number, a: number, n: number): number {
    return (x0 * reach * Math.cosh(reach * a) * 2) / n;
}

/** Uma página na escolha do quadro: a fila (`scatterPageKey`) e se pede caminhos pela mudança (`scatterPageMotion`). */
export interface ScatterCandidate {
    readonly key: number;
    readonly motion: boolean;
}

/**
 * As páginas do quadro (espelho de `cloud_scatter_select_main`): as de encher a janela (e as novas) da fila mais alta à
 * mais baixa até `budget`; as da mudança, do mesmo modo, até `motion` no que sobra; dentro da fila do corte, pela ordem
 * da página. Devolve os índices escolhidos.
 */
export function scatterChoose(
    pages: readonly ScatterCandidate[],
    budget: number,
    motion: number,
): number[] {
    const pick = (list: { i: number; key: number }[], left: number): number[] =>
        list
            .filter((x) => x.key > 0)
            .sort((a, b) => b.key - a.key || a.i - b.i)
            .slice(0, left)
            .map((x) => x.i);
    const all = pages.map((p, i) => ({ i, key: p.key, motion: p.motion }));
    const fill = pick(
        all.filter((x) => !x.motion),
        budget,
    );
    const moving = pick(
        all.filter((x) => x.motion),
        Math.min(motion, budget - fill.length),
    );
    return [...fill, ...moving];
}
