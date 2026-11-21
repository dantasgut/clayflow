import { describe, expect, it } from 'vitest';
import {
    CLOUD_GRADIENT_TOLERANCE,
    CLOUD_HISTORY_BLEND,
    CLOUD_SKY_DISTANCE,
    cloudDivergence,
    cloudGradientNoise,
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
