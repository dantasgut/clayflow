import { describe, expect, it } from 'vitest';
import {
    buildVolume,
    cloudDensity,
    drainePhase,
    heightProfile,
    hgPhase,
    jdeParams,
    jdePhase,
    marchCloud,
    opticalDepth,
    profileLimits,
    sampleVolume,
    shadowDepth,
    shadowDepthMarched,
    shadowTexel,
    shadowTransmittance,
    shellSegments,
    SHADOW_KNOTS,
    shadowKnot,
    sphereSpan,
    typeField,
    type CloudModel,
    type Vec3,
} from '../cloudModel';

/** ∫ p dω com c = 1 − 2x⁴ (amostras densas perto da frente, onde a fase da gotícula tem o pico). */
function sphereIntegral(p: (c: number) => number, n = 400000): number {
    let s = 0;
    for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n;
        s += p(1 - 2 * x ** 4) * 8 * x ** 3;
    }
    return (2 * Math.PI * s) / n;
}

/** Camada homogênea (volumes constantes): a densidade é só o perfil de altura e a cobertura. */
function flatModel(coverage = 1, type = 0.5): CloudModel {
    const one = buildVolume(() => [1, 1, 1, 1], 2);
    const zero = buildVolume(() => [0, 0, 0, 0], 2);
    return {
        groundRadius: 6_360_200,
        base: 1500,
        top: 2500,
        coverage: () => [coverage, type, 1],
        density: 0.02,
        albedo: 0.99,
        shape: one,
        detail: zero,
        shapeScale: 12000,
        detailScale: 1800,
        shapeOffset: [0, 0, 0],
        detailOffset: [0, 0, 0],
        windDir: [1, 0],
    };
}

describe("fase de Jendersie & d'Eon", () => {
    it('os parâmetros do ajuste (Eq. 4–7) a 20 µm', () => {
        // Act
        const p = jdeParams(20);
        // Assert: as expressões do artigo avaliadas em d = 20.
        expect(p.gHG).toBeCloseTo(Math.exp(-0.0990567 / 18.32846), 12);
        expect(p.gHG).toBeCloseTo(0.99461, 4);
        expect(p.gD).toBeCloseTo(0.59383, 4);
        expect(p.alpha).toBeCloseTo(27.1137, 3);
        expect(p.wD).toBeCloseTo(0.49818, 4);
    });

    it('Draine reduz a HG com α = 0 e a Cornette-Shanks com α = 1', () => {
        for (const c of [-0.9, -0.2, 0.3, 0.95]) {
            expect(drainePhase(c, 0.6, 0)).toBeCloseTo(hgPhase(c, 0.6), 14);
            const g = 0.6;
            const cs =
                ((3 / (8 * Math.PI)) * (1 - g * g) * (1 + c * c))
                / ((2 + g * g) * (1 + g * g - 2 * g * c) ** 1.5);
            expect(drainePhase(c, g, 1)).toBeCloseTo(cs, 12);
        }
    });

    it('normalizada a 1 em 4π em toda a faixa de diâmetros, e nas oitavas', () => {
        for (const d of [5, 10, 20, 35, 50])
            for (const scale of [1, 0.5, 0.25])
                expect(sphereIntegral((c) => jdePhase(c, jdeParams(d), scale))).toBeCloseTo(1, 3);
    });

    it('pico para a frente muito maior que para trás (o brilho prateado contra o sol)', () => {
        const p = jdeParams(20);
        expect(jdePhase(1, p) / jdePhase(-1, p)).toBeGreaterThan(1000);
    });
});

describe('perfil de altura', () => {
    it('contínuo no tipo e nos limites dos três tipos', () => {
        expect(profileLimits(0)).toEqual([0, 0.1, 0.2, 0.3]);
        expect(profileLimits(0.5)).toEqual([0, 0.25, 0.6, 0.95]);
        expect(profileLimits(1)).toEqual([0, 0.1, 0.8, 1]);
        for (let t = 0; t < 1; t += 0.01)
            for (const h of [0.05, 0.2, 0.5, 0.9])
                expect(Math.abs(heightProfile(h, t + 1e-6) - heightProfile(h, t))).toBeLessThan(
                    1e-4,
                );
    });

    it('zero fora da camada; o estrato é fino e o cúmulo-nimbo vai ao topo', () => {
        expect(heightProfile(-0.01, 0.5)).toBe(0);
        expect(heightProfile(1.01, 0.5)).toBe(0);
        expect(heightProfile(0.5, 0)).toBe(0);
        expect(heightProfile(0.15, 0)).toBeGreaterThan(0.9);
        expect(heightProfile(0.75, 1)).toBeCloseTo(1, 10);
    });
});

describe('campo do tipo', () => {
    it('varia em volta do tipo pedido, em [0, 1], com média no pedido', () => {
        // Arrange + Act
        const v: number[] = [];
        for (let k = 0; k < 2000; k++)
            v.push(typeField(((k * 0.618034) % 1) * 60_000, ((k * 0.754878) % 1) * 60_000, 0.5));
        const mean = v.reduce((a, b) => a + b, 0) / v.length;
        const sorted = [...v].sort((a, b) => a - b);
        // Assert: o desenvolvimento vertical muda de uma nuvem para outra (10–90 % numa faixa de ≥ 0,4).
        expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...v)).toBeLessThanOrEqual(1);
        expect(Math.abs(mean - 0.5)).toBeLessThan(0.05);
        expect(sorted[1800]! - sorted[200]!).toBeGreaterThan(0.4);
        expect(typeField(1234, 5678, 0)).toBeGreaterThanOrEqual(0);
    });
});

describe('volumes e densidade', () => {
    it('a leitura trilinear repete com o período do volume', () => {
        const v = buildVolume((p) => [p[0], p[1], p[2], 0.5], 8);
        const a = sampleVolume(v, [0.3, 0.7, 0.1]);
        const b = sampleVolume(v, [1.3, -0.3, 2.1]);
        for (let c = 0; c < 4; c++) expect(b[c]).toBeCloseTo(a[c]!, 12);
    });

    it('cobertura 0 sem nuvem; cobertura 1 com o perfil cheio', () => {
        const x: Vec3 = [0, 2000, 0];
        expect(cloudDensity(flatModel(0), x)).toBe(0);
        expect(cloudDensity(flatModel(1), x)).toBeGreaterThan(0.5);
        expect(cloudDensity(flatModel(1), [0, 1000, 0])).toBe(0);
    });
});

describe('transmitância e mapa visto do sol', () => {
    it('T(p) do mapa abaixo da camada é a integral exata; dentro dela, a mesma ordem', () => {
        // Arrange
        const m = flatModel(1, 0.5);
        const down: Vec3 = [0, -1, 0];
        const top: Vec3 = [0, 4000, 0];
        const texel = shadowTexel(m, top, down, 512);
        // O trecho da casca ao longo do raio (do topo da casca à base): 1500 m a 2500 m de distância da origem.
        const [a, b] = [1500, 2500];
        // Act + Assert: abaixo da base, o trecho inteiro.
        const exact = Math.exp(-opticalDepth(m, [0, 500, 0], [0, 1, 0], 2048));
        expect(shadowTransmittance(texel, 3500, a, b)).toBeCloseTo(exact, 3);
        // Dentro: τ linear entre os quartos do trecho segue o perfil de altura (a extinção média do trecho inteiro, o Beer
        // shadow map simples, dava 125 % de erro a 300 m do topo).
        for (const y of [2400, 2200, 1900, 1600]) {
            const tauInside = opticalDepth(m, [0, y, 0], [0, 1, 0], 2048);
            const tauMap = -Math.log(shadowTransmittance(texel, 4000 - y, a, b));
            expect(Math.abs(tauMap - tauInside)).toBeLessThan(0.25 * tauInside + 0.2);
        }
    });

    it('com o sol a 4°, o nó do lado do sol e o pedaço marchado seguem τ exato; quatro nós lineares, não', () => {
        // Arrange: cobertura que oscila a cada 3 km (estrutura ao longo do raio do sol, que cruza ~14 km da camada).
        const base = flatModel(1, 0.5);
        const m: CloudModel = {
            ...base,
            coverage: (x) => [0.65 + 0.35 * Math.sin((2 * Math.PI * x) / 3000), 0.5, 1],
        };
        const e = (4 * Math.PI) / 180;
        const sun: Vec3 = [Math.cos(e), Math.sin(e), 0];
        const down: Vec3 = [-sun[0], -sun[1], -sun[2]];
        const far = 200_000;
        let worst16 = 0;
        let worst4 = 0;
        for (const [x, y] of [
            [0, 1700],
            [700, 1900],
            [2600, 2100],
            [-3100, 2300],
            [5200, 1600],
        ] as const) {
            const q: Vec3 = [x, y, 0];
            const o: Vec3 = [q[0] + sun[0] * far, q[1] + sun[1] * far, q[2] + sun[2] * far];
            const [a, b] = shellSegments(m, o, down, Infinity)[0]!;
            const exact = opticalDepth(m, q, sun, 4096);
            // Act
            const marched = shadowDepthMarched(m, q, sun, shadowTexel(m, o, down), far, a, b);
            const linear4 = shadowDepth(shadowTexel(m, o, down, 192, 4), far, a, b);
            // Assert (relativo, com piso de 0,5 de τ)
            worst16 = Math.max(worst16, Math.abs(marched - exact) / Math.max(exact, 0.5));
            worst4 = Math.max(worst4, Math.abs(linear4 - exact) / Math.max(exact, 0.5));
        }
        // Medido: 16 nós com o pedaço marchado 1,0 % (o pente fixo no mundo, até 128 amostras); quatro nós lineares, 20 %.
        expect(worst16).toBeLessThan(0.02);
        expect(worst4).toBeGreaterThan(0.1);
    });

    it('com o sol baixo descendo, τ do chão pelo mapa segue a integral sem oscilar (o pente não escorrega)', () => {
        // Arrange: estrutura de 300 m ao longo do raio do sol (menor que o passo do mapa no trecho de ~30 km a 4,4°): o
        // pente em frações do trecho escorregava um passo inteiro a cada ~0,06° e τ oscilava nesse período.
        const base = flatModel(1, 0.5);
        const m: CloudModel = {
            ...base,
            top: 4000,
            coverage: (x) => [0.6 + 0.4 * Math.sin((2 * Math.PI * x) / 300), 0.5, 1],
        };
        const far = 400_000;
        const texelTau: number[] = [];
        const exactTau: number[] = [];
        for (let k = 0; k <= 120; k++) {
            const e = ((4.6 - k * 0.005) * Math.PI) / 180;
            const sun: Vec3 = [Math.cos(e), Math.sin(e), 0];
            const down: Vec3 = [-sun[0], -sun[1], -sun[2]];
            const o: Vec3 = [sun[0] * far, sun[1] * far, 0];
            // Act
            const texel = shadowTexel(m, o, down);
            texelTau.push(shadowKnot(texel, SHADOW_KNOTS));
            exactTau.push(opticalDepth(m, [0, 0, 0], sun, 16384));
        }
        // Assert: a variação total da série do mapa perto da exata (a oscilação somaria dezenas de vezes τ).
        const variation = (v: number[]): number =>
            v.slice(1).reduce((a, x, i) => a + Math.abs(x - v[i]!), 0);
        const worst = Math.max(
            ...texelTau.map((t, i) => Math.abs(t - exactTau[i]!) / exactTau[i]!),
        );
        expect(variation(texelTau)).toBeLessThan(1.5 * variation(exactTau) + 0.05 * exactTau[0]!);
        expect(worst).toBeLessThan(0.05);
    });

    it('com o sol abaixo do horizonte, o texel de uma coluna que cruza a camada não fica vazio', () => {
        // Arrange: o sol a −0,5°; um ponto da camada a 3 km sobre a câmera recebe o sol rasante por cima do chão.
        const m = flatModel(0.5, 0.5);
        const e = (-0.5 * Math.PI) / 180;
        const sun: Vec3 = [Math.cos(e), Math.sin(e), 0];
        const down: Vec3 = [-sun[0], -sun[1], -sun[2]];
        const q: Vec3 = [0, 2400, 0];
        // A origem da coluna: a saída do topo da casca do lado do sol (`cloud_sun_entry`).
        const exit = sphereSpan(m, q, sun, m.groundRadius + m.top)![1];
        const o: Vec3 = [q[0] + sun[0] * (exit + 1), q[1] + sun[1] * (exit + 1), q[2]];
        // Act
        const texel = shadowTexel(m, o, down);
        const [a, b] = shellSegments(m, o, down, Infinity)[0]!;
        const tau = shadowDepth(texel, exit + 1, a, b);
        // Assert
        expect(tau).toBeGreaterThan(1);
        expect(Math.abs(tau - opticalDepth(m, q, sun, 8192)) / tau).toBeLessThan(0.05);
    });

    it('a marcha sem nuvem deixa tudo passar; com nuvem espessa, quase nada', () => {
        const light = {
            sunDir: [0, 1, 0] as Vec3,
            sun: [1, 1, 1] as Vec3,
            ambientUp: [0.1, 0.1, 0.1] as Vec3,
            ambientDown: [0.05, 0.05, 0.05] as Vec3,
        };
        const oct = { count: 3, a: 0.5, b: 0.5, c: 0.5 };
        const clear = marchCloud(
            flatModel(0),
            [0, 0, 0],
            [0, 1, 0],
            Infinity,
            light,
            jdeParams(20),
            oct,
            64,
            16,
        );
        expect(clear.transmittance).toBe(1);
        const thick = marchCloud(
            flatModel(1),
            [0, 0, 0],
            [0, 1, 0],
            Infinity,
            light,
            jdeParams(20),
            oct,
            128,
            32,
        );
        expect(thick.transmittance).toBeLessThan(1e-3);
        expect(thick.scattered[0]).toBeGreaterThan(0);
        expect(thick.depth).toBeGreaterThan(1500);
        expect(thick.depth).toBeLessThan(2500);
    });
});
