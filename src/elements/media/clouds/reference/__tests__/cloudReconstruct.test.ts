import { describe, expect, it } from 'vitest';
import {
    CLOUD_HISTORY_BLEND,
    CLOUD_SKY_DISTANCE,
    cloudDivergence,
    cloudFreshForSurface,
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
        // Arrange: nos pixels marchados o histórico era céu, agora é nuvem.
        const out = reconstructTexel({
            marched: false,
            valid: true,
            fresh: cloud,
            history: sky,
            check: sky,
            neighbors: [
                { fresh: cloud, check: sky },
                { fresh: cloud, check: sky },
                { fresh: sky, check: sky },
            ],
        });
        // Assert
        expect(out).toEqual(cloud);
        expect(cloudDivergence(sky, cloud)).toBeGreaterThan(0.2);
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
});
