import { describe, expect, it } from 'vitest';
import {
    CLOUD_GRADIENT_TOLERANCE,
    CLOUD_HISTORY_BLEND,
    CLOUD_FOLLOW_CHANGE,
    CLOUD_HISTORY_FOLLOW,
    CLOUD_SKY_DISTANCE,
    cloudDivergence,
    cloudGradientNoise,
    cloudGradientWeight,
    cloudHistoryFollow,
    cloudFreshAt,
    cloudFreshForSurface,
    cloudHistoryReset,
    cloudMomentsOf,
    reconstructTexel,
    type Rgba,
} from '../cloudReconstruct';

// Reconstrução temporal das nuvens (spec 041, T021): o espelho de `cloud_reconstruct.wgsl`.

const cloud: Rgba = [10, 10, 10, 0.4];
const sky: Rgba = [0, 0, 0, 1];

describe('reconstrução temporal', () => {
    it('o pixel marchado mistura o valor exato ao histórico coerente (média exponencial)', () => {
        const hist: Rgba = [11, 11, 11, 0.42];
        const out = reconstructTexel({
            marched: true,
            valid: true,
            fresh: cloud,
            history: hist,
            check: hist,
            neighbors: [
                { fresh: cloud, check: hist },
                { fresh: [12, 12, 12, 0.44], check: hist },
            ],
        });
        expect(out[0]).toBeCloseTo(11 + (10 - 11) * CLOUD_HISTORY_BLEND, 12);
        expect(out[3]).toBeCloseTo(0.42 + (0.4 - 0.42) * CLOUD_HISTORY_BLEND, 12);
    });

    it('série inválida ou histórico fora da tela: o valor do bloco', () => {
        const n = [{ fresh: cloud, check: cloud }];
        expect(
            reconstructTexel({
                marched: false,
                valid: false,
                fresh: cloud,
                history: sky,
                check: cloud,
                neighbors: n,
            }),
        ).toEqual(cloud);
        expect(
            reconstructTexel({
                marched: false,
                valid: true,
                fresh: cloud,
                history: undefined,
                check: cloud,
                neighbors: n,
            }),
        ).toEqual(cloud);
    });

    it('gradiente temporal: a vizinhança que mudou larga o histórico (sem sal e pimenta)', () => {
        // Arrange: nos pixels marchados dos 3 × 3 blocos o histórico era céu, agora é nuvem em 7 deles.
        const out = reconstructTexel({
            marched: false,
            valid: true,
            fresh: cloud,
            history: sky,
            check: sky,
            neighbors: [...Array<number>(9).keys()].map((k) => ({
                fresh: k < 7 ? cloud : sky,
                check: sky,
            })),
        });
        // Assert
        expect(out).toEqual(cloud);
        expect(cloudDivergence(sky, cloud)).toBeGreaterThan(0.2);
    });

    it('o ruído da borda rala não reprova o bloco: a divergência dentro do erro padrão da média fica com o histórico', () => {
        // Arrange: a borda rala — as amostras dos 3 × 3 blocos ora na nuvem fina (a = 0,7), ora fora (o céu), o histórico
        // a média delas; a média dos valores exatos (5 de 9 na nuvem) diverge da do histórico (4 de 9) além da
        // tolerância, dentro do ruído de 9 amostras (R19).
        const thin: Rgba = [6, 6, 6, 0.7];
        const avg = (k: number): Rgba => [(6 * k) / 9, (6 * k) / 9, (6 * k) / 9, 1 - (0.3 * k) / 9];
        const fresh = [...Array<number>(9).keys()].map((k) => (k < 5 ? thin : sky));
        const neighbors = fresh.map((f) => ({ fresh: f, check: avg(4) }));
        const out = reconstructTexel({
            marched: false,
            valid: true,
            fresh: thin,
            history: avg(4),
            check: avg(4),
            neighbors,
            // Só a decisão do gradiente (o seguimento do desvio medido tem o seu teste).
            follow: 0,
        });
        // Assert: a divergência passa da tolerância, a reconstrução fica com o histórico (dentro da caixa)
        const mean = (k: number): Rgba => avg(k);
        expect(cloudDivergence(mean(4), mean(5))).toBeGreaterThan(0.1);
        expect(cloudDivergence(mean(4), mean(5))).toBeLessThan(
            CLOUD_GRADIENT_TOLERANCE + cloudGradientNoise(fresh),
        );
        expect(out).toEqual(avg(4));
    });

    it('o ruído de uma amostra não reprova o bloco: a média da vizinhança decide; o histórico é recortado com folga', () => {
        // Arrange: a amostra do bloco diverge do histórico (o ruído do deslocamento inicial), a média dos 3 × 3 não.
        const hist: Rgba = [30, 30, 30, 0.1];
        const noisy: Rgba = [6, 6, 6, 0.5];
        const out = reconstructTexel({
            marched: false,
            valid: true,
            fresh: noisy,
            history: hist,
            check: cloud,
            neighbors: [
                { fresh: noisy, check: cloud },
                { fresh: [14, 14, 14, 0.3], check: cloud },
                { fresh: cloud, check: cloud },
            ],
        });
        expect(cloudDivergence(cloud, noisy)).toBeGreaterThan(0.2);
        // A caixa [6, 14] × [0,3; 0,5] com folga de metade: [2, 18] × [0,2; 0,6].
        expect(out[0]).toBeCloseTo(18, 12);
        expect(out[3]).toBeCloseTo(0.2, 12);
    });

    it('reprojeção exata (câmera parada ou girando): o detalhe claro fora da caixa de uma amostra por bloco fica', () => {
        // Arrange: o histórico do pixel guarda a borda prateada (60) que as amostras dos 3 × 3 blocos deste quadro não
        // pegaram; nos pixels marchados o histórico concorda com elas (o gradiente aprova).
        const hist: Rgba = [60, 60, 60, 0.1];
        const dark: Rgba = [8, 8, 8, 0.1];
        const dim: Rgba = [10, 10, 10, 0.1];
        const input = {
            marched: false,
            valid: true,
            fresh: dark,
            history: hist,
            check: dark,
            neighbors: [
                { fresh: dark, check: dark },
                { fresh: dim, check: dim },
            ],
        };
        // Act
        const still = reconstructTexel({ ...input, clip: 0 });
        const moving = reconstructTexel({ ...input, clip: 1 });
        const half = reconstructTexel({ ...input, clip: 0.5 });
        // Assert: parada, o histórico inteiro; andando, recortado à caixa [8, 10] com folga ([7, 11]); no meio, a média.
        expect(still[0]).toBe(60);
        expect(moving[0]).toBeCloseTo(11, 12);
        expect(half[0]).toBeCloseTo(35.5, 12);
    });

    it('superfície: o valor do bloco marchado no céu não entra no pixel do chão, nem o histórico do céu', () => {
        // Arrange: o pixel do chão a 2,5 km; o bloco foi marchado no céu, o vizinho de baixo no chão a 1,4 km.
        const limits = [CLOUD_SKY_DISTANCE, CLOUD_SKY_DISTANCE, 1400, 900];
        // Act
        const pick = cloudFreshForSurface(2500, limits);
        const out = reconstructTexel({
            marched: false,
            valid: true,
            fresh: sky,
            surface: 2500,
            historySurface: CLOUD_SKY_DISTANCE,
            history: cloud,
            check: cloud,
            neighbors: [{ fresh: cloud, check: cloud }],
        });
        // Assert: o chão mais parecido (1,4 km, o dobro está dentro da tolerância) e o histórico do céu largado.
        expect(pick).toBe(2);
        expect(cloudFreshForSurface(CLOUD_SKY_DISTANCE, limits)).toBe(0);
        expect(out).toEqual(sky);
    });

    it('o ruído temporal do pixel (a faixa fina) não reprova o bloco; a mudança da nuvem ainda reprova', () => {
        // Arrange: a faixa clara de 1–2 px dentro do pixel de ¼: a amostra acerta a faixa (luz 40) em ¼ dos quadros e o
        // céu (luz 4) nos outros; o histórico é a média (13) e o segundo momento o das amostras.
        const bright: [number, number, number, number] = [40, 40, 40, 0.6];
        const dim: [number, number, number, number] = [4, 4, 4, 0.95];
        const avg = [0, 1, 2, 3].map((c) => 0.25 * bright[c]! + 0.75 * dim[c]!) as unknown as [
            number,
            number,
            number,
            number,
        ];
        const mb = cloudMomentsOf(bright);
        const md = cloudMomentsOf(dim);
        const moments: [number, number] = [
            0.25 * mb[0] + 0.75 * md[0],
            0.25 * mb[1] + 0.75 * md[1],
        ];
        const input = (fresh: typeof bright, withMoments: boolean) => ({
            marched: false,
            valid: true,
            fresh,
            history: avg,
            check: avg,
            // Só a decisão do gradiente (o seguimento do desvio medido tem o seu teste).
            follow: 0,
            neighbors: [...Array<number>(9).keys()].map((k) => ({
                fresh: k < 5 ? fresh : avg,
                check: avg,
                ...(withMoments ? { moments } : {}),
            })),
        });
        // Act: neste quadro 5 dos 9 blocos acertaram a faixa (o ruído da amostra).
        const kept = reconstructTexel(input(bright, true));
        const lost = reconstructTexel(input(bright, false));
        // Assert: com o ruído temporal o pixel fica com o histórico; sem ele, o bloco largava o histórico.
        expect(kept).toEqual(avg);
        expect(lost).toEqual(bright);
        // A nuvem que muda de verdade (o histórico sem variância, céu limpo que vira nuvem) ainda reprova.
        const sky: [number, number, number, number] = [5, 5, 5, 1];
        const cloud: [number, number, number, number] = [30, 30, 30, 0.2];
        const changed = reconstructTexel({
            marched: false,
            valid: true,
            fresh: cloud,
            history: sky,
            check: sky,
            neighbors: [...Array<number>(9).keys()].map((k) => ({
                fresh: k < 7 ? cloud : sky,
                check: sky,
                moments: cloudMomentsOf(sky),
            })),
        });
        expect(changed).toEqual(cloud);
    });

    it('o bloco que larga o histórico: cada texel com o valor exato interpolado no lugar dele, não o do bloco nos quatro', () => {
        // Arrange: o sol rente ao horizonte escurece a base (o histórico 24, agora 8 em todos os blocos); o bloco do texel
        // foi marchado com uma amostra escura (2: o ruído de uma amostra) e o vizinho da direita com 14. O texel fica a
        // meio caminho entre os dois marchados na linha (fração ½, 0).
        const hist: Rgba = [24, 24, 24, 0.1];
        const samples = [
            { value: [2, 2, 2, 0.1] as Rgba, surface: CLOUD_SKY_DISTANCE },
            { value: [14, 14, 14, 0.1] as Rgba, surface: CLOUD_SKY_DISTANCE },
            { value: [99, 99, 99, 0.1] as Rgba, surface: CLOUD_SKY_DISTANCE },
            { value: [99, 99, 99, 0.1] as Rgba, surface: CLOUD_SKY_DISTANCE },
        ];
        // Act
        const here = cloudFreshAt([0.5, 0], samples, CLOUD_SKY_DISTANCE, samples[0]!.value);
        const out = reconstructTexel({
            marched: false,
            valid: true,
            fresh: samples[0]!.value,
            here,
            history: hist,
            check: hist,
            neighbors: [...Array<number>(9).keys()].map(() => ({
                fresh: [8, 8, 8, 0.1] as Rgba,
                check: hist,
            })),
        });
        // Assert: a média dos dois marchados da linha (8), não a amostra do bloco (2); as linhas de baixo (fração 0) não
        // entram.
        expect(here[0]).toBeCloseTo(8, 12);
        expect(out[0]).toBeCloseTo(8, 12);
        // O marchado do bloco (fração 0) é o valor dele; um vizinho de outra superfície fica de fora.
        expect(cloudFreshAt([0, 0], samples, CLOUD_SKY_DISTANCE, sky)[0]).toBe(2);
        const ground = samples.map((x, k) => (k === 1 ? { ...x, surface: 900 } : x));
        expect(cloudFreshAt([0.5, 0], ground, CLOUD_SKY_DISTANCE, sky)[0]).toBe(2);
    });

    it('a rampa do gradiente: nada até a tolerância, tudo a 1,5 × ela; no meio, o histórico recortado e o valor exato', () => {
        expect(cloudHistoryReset(0.2, 0.25)).toBe(0);
        expect(cloudHistoryReset(0.25, 0.25)).toBe(0);
        expect(cloudHistoryReset(0.3125, 0.25)).toBeCloseTo(0.5, 12);
        expect(cloudHistoryReset(0.375, 0.25)).toBe(1);
        expect(cloudHistoryReset(2, 0.25)).toBe(1);
        // Blocos vizinhos com divergências pouco diferentes em volta da tolerância saem parecidos (sem o degrau de tudo
        // ou nada entre um bloco e o outro).
        expect(
            Math.abs(cloudHistoryReset(0.26, 0.25) - cloudHistoryReset(0.24, 0.25)),
        ).toBeLessThan(0.1);
    });
});

/** O pixel marchado do bloco no quadro (`cloud_bayer`). */
const bayer = (frame: number): [number, number] =>
    (
        [
            [0, 0],
            [1, 1],
            [1, 0],
            [0, 1],
        ] as const
    )[frame & 3] as [number, number];

/**
 * A reconstrução de uma grade de `B × B` blocos (2B × 2B texels, a câmera parada: o histórico de cada texel é o dele)
 * quadro a quadro, com a luz exata `light(x, y, t)` amostrada sem ruído no marchado de cada bloco. A janela do gradiente
 * de cada texel pelos pesos `weight` (a do motor, `cloudGradientWeight`, ou outra para comparar). Devolve o histórico.
 */
function runGrid(
    blocks: number,
    frames: number,
    light: (x: number, y: number, t: number) => number,
    start: (x: number, y: number) => number,
    weight: (o: [number, number], f: [number, number], q: [number, number]) => number,
    follow = CLOUD_HISTORY_FOLLOW,
): number[] {
    const N = 2 * blocks;
    let h = Array.from({ length: N * N }, (_, i) => start(i % N, Math.floor(i / N)));
    const clampB = (v: number): number => Math.min(Math.max(v, 0), blocks - 1);
    for (let t = 1; t <= frames; t++) {
        const [bx, by] = bayer(t);
        const fresh = (cx: number, cy: number): Rgba => {
            const v = light(2 * cx + bx, 2 * cy + by, t);
            return [v, v, v, 0.5];
        };
        const check = (cx: number, cy: number): Rgba => {
            const v = h[(2 * cy + by) * N + 2 * cx + bx]!;
            return [v, v, v, 0.5];
        };
        const next = h.slice();
        for (let y = 0; y < N; y++)
            for (let x = 0; x < N; x++) {
                const b = [Math.floor(x / 2), Math.floor(y / 2)];
                const rel = [x - bx, y - by];
                const b0 = [Math.floor(rel[0]! / 2), Math.floor(rel[1]! / 2)];
                const f: [number, number] = [
                    (rel[0]! - 2 * b0[0]!) / 2,
                    (rel[1]! - 2 * b0[1]!) / 2,
                ];
                const neighbors = [];
                for (let k = 0; k < 16; k++) {
                    const o: [number, number] = [(k % 4) - 1, Math.floor(k / 4) - 1];
                    const w = weight(o, f, [x, y]);
                    if (w <= 0) continue;
                    const nx = clampB(b0[0]! + o[0]);
                    const ny = clampB(b0[1]! + o[1]);
                    neighbors.push({ fresh: fresh(nx, ny), check: check(nx, ny), weight: w });
                }
                const box = [];
                for (let k = 0; k < 9; k++)
                    box.push(
                        fresh(clampB(b[0]! + (k % 3) - 1), clampB(b[1]! + Math.floor(k / 3) - 1)),
                    );
                const v = h[y * N + x]!;
                next[y * N + x] = reconstructTexel({
                    marched: x === 2 * b[0]! + bx && y === 2 * b[1]! + by,
                    valid: true,
                    fresh: fresh(b[0]!, b[1]!),
                    history: [v, v, v, 0.5],
                    check: check(b[0]!, b[1]!),
                    neighbors,
                    box,
                    clip: 0,
                    follow,
                })[0];
            }
        h = next;
    }
    return h;
}

describe('reconstrução temporal: o histórico segue o desvio medido (a grade de idades)', () => {
    const B = 8;
    const N = 2 * B;
    const base = (x: number, y: number): number => 10 + 2 * Math.sin(x / 3) + 1.5 * Math.cos(y / 4);
    const window = (o: [number, number], f: [number, number]): number => cloudGradientWeight(o, f);

    it('a janela anda com o texel e não tem resposta negativa em frequência nenhuma', () => {
        // Arrange: os pesos num eixo no marchado (fração 0) e entre dois (½).
        const axis = (f: number): number[] =>
            [-1, 0, 1, 2].map(
                (o) => cloudGradientWeight([o, 0], [f, 0]) / cloudGradientWeight([0, 0], [f, 0]),
            );
        // Act / Assert: [1, 2, 1] e [1, 3, 3, 1]
        expect(axis(0)).toEqual([0.5, 1, 0.5, 0]);
        expect(axis(0.5).map((v) => v * 1.5)).toEqual([0.5, 1.5, 1.5, 0.5]);
        for (const f of [0, 0.5])
            for (let k = 0; k <= 64; k++) {
                const w = (Math.PI * k) / 64;
                const r = [-1, 0, 1, 2].reduce(
                    (s, o) => s + cloudGradientWeight([o, 0], [f, 0]) * Math.cos(w * (o - f)),
                    0,
                );
                expect(r).toBeGreaterThanOrEqual(-1e-12);
            }
    });

    it('a luz que muda: o histórico ~1 quadro atrás e os quatro texels do bloco com a mesma idade', () => {
        // Arrange: a luz sobe 0,5 % por quadro (o sol que anda), dentro da tolerância do gradiente (nenhum bloco larga).
        const r = 0.005;
        const light = (x: number, y: number, t: number): number => base(x, y) * (1 + r * t);
        const frames = 200;
        const measure = (h: number[]): { lag: number; spread: number } => {
            let lag = 0;
            let spread = 0;
            for (let by = 1; by < B - 1; by++)
                for (let bx = 1; bx < B - 1; bx++) {
                    const e = [0, 1, 2, 3].map((k) => {
                        const x = 2 * bx + (k & 1);
                        const y = 2 * by + (k >> 1);
                        return (light(x, y, frames) - h[y * N + x]!) / (base(x, y) * r);
                    });
                    lag += e.reduce((s, v) => s + v, 0) / 4;
                    spread += Math.max(...e) - Math.min(...e);
                }
            const n = (B - 2) ** 2;
            return { lag: lag / n, spread: spread / n };
        };
        // Act
        const now = measure(runGrid(B, frames, light, base, window));
        const before = measure(runGrid(B, frames, light, base, window, 0));
        // Assert: sem seguir, ~13 quadros atrás e as idades de 0 a 3 quadros no bloco (a grade de 2·S px); seguindo ½, ~1
        // quadro e ~0,2.
        expect(before.lag).toBeGreaterThan(12);
        expect(before.spread).toBeGreaterThan(2.5);
        expect(now.lag).toBeLessThan(1.2);
        expect(now.spread).toBeLessThan(0.3);
    });

    it('estável: o erro em faixas de blocos alternados se apaga com a janela; com a média 3 × 3 de pesos iguais, cresce', () => {
        // Arrange: a luz parada, o histórico com ±5 % em colunas de blocos alternadas.
        const light = (x: number, y: number): number => base(x, y);
        const start = (x: number, y: number): number =>
            base(x, y) * (1 + 0.05 * (Math.floor(x / 2) % 2 === 0 ? 1 : -1));
        // A média 3 × 3 de pesos iguais em volta do bloco (o desenho que amplificava a faixa).
        const box = (o: [number, number]): number => (o[0] <= 1 && o[1] <= 1 ? 1 : 0);
        const error = (h: number[]): number =>
            Math.max(...h.map((v, i) => Math.abs(v / base(i % N, Math.floor(i / N)) - 1)));
        // Act: 40 quadros (10 voltas do rodízio).
        const alone = error(runGrid(B, 40, light, start, window, 0));
        const smooth = error(runGrid(B, 40, light, start, window));
        const flat = error(runGrid(B, 40, light, start, box));
        // Assert: com a janela, o erro cai de 5 % a < 1 % (só a média exponencial: ~0,3 %); com a média de pesos iguais,
        // cresce.
        expect(alone).toBeLessThan(0.0035);
        expect(smooth).toBeLessThan(0.01);
        expect(flat).toBeGreaterThan(0.05);
    });

    it('o ruído da média contra a mudança esperada: o ganho cai a ½ com σ = τ e quase some na faixa ruidosa', () => {
        const at = (noise: number): number =>
            cloudHistoryFollow([12, 12, 12, 1], [10, 10, 10, 1], noise)[0] - 1;
        expect(at(CLOUD_FOLLOW_CHANGE) / at(0)).toBeCloseTo(0.5, 12);
        expect(at(0.65) / at(0)).toBeLessThan(0.03);
    });

    it('sem viés pelo ruído: o fator médio sobre amostras ruidosas é 1 (a razão F/C sobe)', () => {
        // Arrange: F uma média de amostras ruidosas (σ 10 %) e C o histórico (variância α/(2 − α) da de F), a mesma média.
        let seed = 12345;
        const rand = (): number => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 2 ** 32;
        };
        const gauss = (): number =>
            Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
        const s = 0.1;
        const sc = s * Math.sqrt(CLOUD_HISTORY_BLEND / (2 - CLOUD_HISTORY_BLEND));
        let sum = 0;
        let naive = 0;
        const n = 1_000_000;
        for (let k = 0; k < n; k++) {
            const f = 10 * (1 + s * gauss());
            const c = 10 * (1 + sc * gauss());
            sum += cloudHistoryFollow([f, f, f, 1], [c, c, c, 1], 0, 1)[0] - 1;
            naive += f / c - 1;
        }
        // Assert: o viés da razão F/C é a variância relativa do histórico (~0,14 %); o do fator, abaixo do erro da média.
        expect(Math.abs(sum / n)).toBeLessThan(3e-4);
        expect(naive / n - sum / n).toBeGreaterThan(1e-3);
    });
});
