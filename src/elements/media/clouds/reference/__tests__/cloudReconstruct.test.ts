import { describe, expect, it } from 'vitest';
import { cloudDivergence, reconstructTexel, type Rgba } from '../cloudReconstruct';

// Reconstrução temporal das nuvens (spec 041, T021): o espelho de `cloud_reconstruct.wgsl`.

const cloud: Rgba = [10, 10, 10, 0.4];
const sky: Rgba = [0, 0, 0, 1];

describe('reconstrução temporal', () => {
    it('o pixel marchado entra exato, com ou sem histórico', () => {
        expect(
            reconstructTexel({
                marched: true,
                valid: true,
                fresh: cloud,
                history: sky,
                check: sky,
                neighbors: [cloud],
            }),
        ).toEqual(cloud);
    });

    it('série inválida ou histórico fora da tela: o valor do bloco', () => {
        expect(
            reconstructTexel({
                marched: false,
                valid: false,
                fresh: cloud,
                history: sky,
                check: cloud,
                neighbors: [cloud],
            }),
        ).toEqual(cloud);
        expect(
            reconstructTexel({
                marched: false,
                valid: true,
                fresh: cloud,
                history: undefined,
                check: cloud,
                neighbors: [cloud],
            }),
        ).toEqual(cloud);
    });

    it('gradiente temporal: o bloco que mudou larga o histórico (sem sal e pimenta)', () => {
        // Arrange: no pixel marchado o histórico era céu, agora é nuvem.
        const out = reconstructTexel({
            marched: false,
            valid: true,
            fresh: cloud,
            history: sky,
            check: sky,
            neighbors: [cloud, sky],
        });
        // Assert
        expect(out).toEqual(cloud);
        expect(cloudDivergence(sky, cloud)).toBeGreaterThan(0.2);
    });

    it('histórico coerente: recortado pela caixa da vizinhança', () => {
        const hist: Rgba = [30, 30, 30, 0.1];
        const out = reconstructTexel({
            marched: false,
            valid: true,
            fresh: cloud,
            history: hist,
            check: [10.5, 10.5, 10.5, 0.41],
            neighbors: [cloud, [12, 12, 12, 0.35]],
        });
        expect(out).toEqual([12, 12, 12, 0.35]);
    });
});
