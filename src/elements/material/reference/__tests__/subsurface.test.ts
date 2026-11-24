import { describe, expect, it } from 'vitest';
import {
    burleyCdf,
    burleyLength,
    burleyMeanRadius,
    burleyProfile,
    burleyRadialPdf,
    burleySample,
    burleyShape,
    burleyShapeSearchlight,
    burleyTransmission,
    randomWalk,
} from '../subsurface';

// Referência do espalhamento sob a superfície (spec 011, T113): o perfil de Christensen e Burley 2015 conferido contra
// o passeio aleatório (a verdade). As tolerâncias são o erro do ajuste do artigo (o perfil é uma aproximação de duas
// exponenciais: o artigo relata 5–8 % de erro relativo médio) mais o ruído do Monte Carlo, que com N caminhos é da ordem
// de 1/√N na fração acumulada (0,003 com 100 mil) — o que domina é o ajuste, medido aqui.

describe('subsurface — perfil de Burley', () => {
    it('a integral do perfil no plano é o albedo', () => {
        // Arrange
        const albedo = 0.6;
        const d = burleyLength(albedo, 1.3);
        // Act: ∫ R(r) 2πr dr por quadratura até 60 d (a cauda além disso é e^(−20)).
        let sum = 0;
        const n = 200_000;
        const dr = (60 * d) / n;
        for (let i = 0; i < n; i++) {
            const r = (i + 0.5) * dr;
            sum += burleyProfile(r, albedo, d) * 2 * Math.PI * r * dr;
        }
        // Assert
        expect(sum).toBeCloseTo(albedo, 5);
    });

    it('a fração acumulada é a integral da densidade radial e a amostragem é a inversa exata dela', () => {
        // Arrange
        const d = 0.7;
        // Act + Assert
        for (const u of [0, 0.01, 0.25, 0.5, 0.9, 0.999]) {
            const r = burleySample(u, d);
            expect(burleyCdf(r, d)).toBeCloseTo(u, 10);
        }
        const h = 1e-5;
        for (const r of [0.1, 0.7, 3]) {
            const slope = (burleyCdf(r + h, d) - burleyCdf(r - h, d)) / (2 * h);
            expect(slope).toBeCloseTo(burleyRadialPdf(r, d), 7);
        }
    });

    it('o raio médio é 2,5 d e a transmissão é a parte do perfil além da espessura', () => {
        // Arrange
        const d = 0.4;
        // Act: o raio médio pela amostragem estratificada.
        let mean = 0;
        const n = 100_000;
        for (let i = 0; i < n; i++) mean += burleySample((i + 0.5) / n, d) / n;
        // Assert
        expect(mean).toBeCloseTo(burleyMeanRadius(d), 3);
        expect(burleyTransmission(0, d)).toBe(1);
        expect(burleyTransmission(1.2, d)).toBeCloseTo(1 - burleyCdf(1.2, d), 12);
    });

    it('o fator de forma segue as equações 5 e 6 do artigo', () => {
        expect(burleyShape(0.8)).toBeCloseTo(1.1, 12);
        expect(burleyShape(0.3)).toBeCloseTo(1.9 - 0.3 + 3.5 * 0.25, 12);
        expect(burleyShapeSearchlight(0.8)).toBeCloseTo(1.05, 12);
        expect(burleyShapeSearchlight(0.3)).toBeCloseTo(1.85 - 0.3 + 7 * 0.125, 12);
    });
});

describe('subsurface — o perfil contra o passeio aleatório', () => {
    /** Maior diferença entre a fração acumulada do passeio e a do perfil nas bordas das faixas. */
    function cdfError(histogram: Float64Array, binWidth: number, total: number, d: number): number {
        let acc = 0;
        let worst = 0;
        for (let k = 0; k < histogram.length; k++) {
            acc += histogram[k]!;
            worst = Math.max(worst, Math.abs(acc / total - burleyCdf((k + 1) * binWidth, d)));
        }
        return worst;
    }

    it('meio semi-infinito, luz difusa: a fração acumulada a menos de 0,03 e o raio médio a menos de 8 % (A ≤ 0,8)', () => {
        for (const alpha of [0.5, 0.8, 0.95, 0.99]) {
            // Arrange + Act
            const walk = randomWalk({ alpha, paths: 100_000, seed: 7 });
            const d = burleyLength(walk.reflectance, 1);
            // Assert: medido com 400 mil caminhos — 0,005, 0,009, 0,022 e 0,011 na fração; 0,3 %, 1,9 %, 7,1 % e 4,3 % no
            // raio médio.
            expect(cdfError(walk.histogram, walk.binWidth, walk.reflectance, d)).toBeLessThan(0.03);
            expect(Math.abs(walk.meanRadius / burleyMeanRadius(d) - 1)).toBeLessThan(0.08);
        }
    });

    it('meio semi-infinito, feixe perpendicular: a fração acumulada a menos de 0,035 com o fator do feixe', () => {
        for (const alpha of [0.5, 0.8, 0.95, 0.99]) {
            // Arrange + Act
            const walk = randomWalk({ alpha, paths: 100_000, seed: 9, incidence: 'normal' });
            const d = burleyLength(walk.reflectance, 1, burleyShapeSearchlight(walk.reflectance));
            // Assert: medido 0,020, 0,013, 0,013 e 0,027.
            expect(cdfError(walk.histogram, walk.binWidth, walk.reflectance, d)).toBeLessThan(
                0.035,
            );
        }
    });

    it('quase sem absorção (A > 0,9) o perfil perde a cauda: o desvio medido fica registrado', () => {
        // Arrange + Act: α = 0,999 dá A ≈ 0,93; a cauda do passeio vai além das duas exponenciais.
        const walk = randomWalk({ alpha: 0.999, paths: 40_000, seed: 5 });
        const d = burleyLength(walk.reflectance, 1);
        // Assert: o passeio sai mais longe (raio médio 3,6 contra 2,4 caminhos livres); a fração acumulada difere 0,065.
        expect(walk.reflectance).toBeGreaterThan(0.9);
        expect(walk.meanRadius).toBeGreaterThan(burleyMeanRadius(d));
        expect(cdfError(walk.histogram, walk.binWidth, walk.reflectance, d)).toBeLessThan(0.09);
    });

    it('placa: a transmissão pela espessura a menos de 0,075 (absoluto) do passeio, de ¼ a 8 caminhos livres', () => {
        for (const alpha of [0.8, 0.95, 0.99]) {
            // Arrange: o albedo da superfície do meio semi-infinito (o que a autoria informa) dá o comprimento do perfil.
            const half = randomWalk({ alpha, paths: 60_000, seed: 3 });
            const d = burleyLength(half.reflectance, 1);
            for (const thickness of [0.25, 0.5, 1, 2, 4, 8]) {
                // Act
                const slab = randomWalk({ alpha, paths: 60_000, thickness, seed: 11 });
                // Assert: medido com 200 mil caminhos — no máximo 0,042 (α 0,8), 0,031 (α 0,95) e 0,068 (α 0,99, em ½
                // caminho livre); o ruído do passeio com 60 mil é 0,002. Além de 4 caminhos livres o perfil fica abaixo
                // (até a metade do valor, já menor que 0,1).
                expect(
                    Math.abs(slab.transmittance - burleyTransmission(thickness, d)),
                ).toBeLessThan(0.075);
            }
        }
    });

    it('placa: o que não é absorvido sai por uma das faces e a placa grossa reflete o albedo', () => {
        // Arrange + Act
        const half = randomWalk({ alpha: 1, paths: 4_000, thickness: 2, seed: 2 });
        const thick = randomWalk({ alpha: 0.9, paths: 40_000, thickness: 40, seed: 2 });
        const semi = randomWalk({ alpha: 0.9, paths: 40_000, seed: 2 });
        // Assert: sem absorção, R + T = 1; a placa de 40 caminhos livres é o meio semi-infinito.
        expect(half.reflectance + half.transmittance).toBeCloseTo(1, 10);
        expect(thick.transmittance).toBeLessThan(1e-3);
        expect(thick.reflectance).toBeCloseTo(semi.reflectance, 2);
    });
});
