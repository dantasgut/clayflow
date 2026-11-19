import { describe, expect, it } from 'vitest';
import {
    AIR_DENSITY,
    BOUNDARY_LAYER_DEPTH,
    balancedWind,
    bump,
    coriolis,
    defaultPressure,
    effectiveRotation,
    ekmanVelocity,
    FREE_DRAG,
    frontIntensity,
    gaussianGradientWind,
    highAmplitudeCap,
    okuboWeiss,
    patternAmplitude,
    patternSystem,
    pressureStencil,
    weatherAt,
    weatherClouds,
    weatherRelax,
    type PressurePattern,
} from '../cloudWeather';
import {
    CLOUD_ANVIL,
    CLOUD_CONGESTUS_REACH,
    CLOUD_DIFFUSE_ASYMMETRY,
    CLOUD_EROSION,
    CLOUD_SHALLOW_EROSION,
    CLOUD_TOWER_THERMAL,
    CLOUD_WATER,
    anvilProfile,
    buildVolume,
    cloudDensity,
    diffuseTransmittance,
    jdeParams,
    marchCloud,
    remap,
    shallowErosion,
    shellSegments,
    towerReach,
    towerThermal,
    towerWater,
    type CloudModel,
    type Vec3,
} from '../cloudModel';
import { phaseTruncation, truncatedPhase } from '../cloudScatter';
import {
    deltaRng,
    deltaTrackRadiance,
    tabulatePhase,
    type PtDeltaScene,
} from '../../../../lighting/reference/pathTracer';

/** Vórtice gaussiano `A·e^(−d²/2σ²)` centrado na origem. */
const gaussian =
    (amplitude: number, sigma: number) =>
    (x: number, z: number): number =>
        amplitude * Math.exp(-(x * x + z * z) / (2 * sigma * sigma));

/** A componente anti-horária (vista de cima) do vento num ponto (x, z) do mundo; norte = −z. */
function counterclockwise(x: number, z: number, east: number, north: number): number {
    const e = x;
    const n = -z;
    const d = Math.hypot(e, n);
    return (-n / d) * east + (e / d) * north;
}

describe('cloudWeather — vento equilibrado (R19)', () => {
    const sigma = 400e3;
    const radii = [100e3, 250e3, 400e3, 600e3, 900e3];

    it.each([
        ['baixa, norte', -2000, 45],
        ['baixa, sul', -2000, -45],
        ['alta regular, norte', 600, 45],
        ['alta regular, sul', 600, -45],
        ['alta anômala (teto fR/2), norte', 1000, 45],
        ['baixa a 20° N', -1500, 20],
    ])(
        '%s: o vento gradiente do vórtice gaussiano é o analítico (Holton §3.2)',
        (_n, amplitude, lat) => {
            // Arrange
            const f = coriolis(lat);
            const fn = gaussian(amplitude, sigma);
            for (const d of radii)
                for (const angle of [0, 1.1, 2.6, 4.4]) {
                    const x = d * Math.cos(angle);
                    const z = d * Math.sin(angle);
                    // Act: atrito desprezível (r/f ~ 1e−5) e estêncil de 2 km
                    const wind = balancedWind(pressureStencil(fn, x, z, 2000), f, 1e-9);
                    const v = counterclockwise(x, z, wind.east, wind.north);
                    // Assert: a componente tangencial a 0,1 % e nada atravessa as isóbaras
                    const expected = gaussianGradientWind(amplitude, sigma, d, f);
                    expect(Math.abs(v - expected)).toBeLessThan(1e-3 * Math.abs(expected) + 1e-4);
                    expect(Math.abs(wind.across)).toBeLessThan(1e-3);
                }
        },
    );

    it('o sentido do giro: anti-horário em volta da baixa no norte, horário no sul; o oposto na alta', () => {
        // Arrange
        const low = gaussian(-1500, sigma);
        const high = gaussian(500, sigma);
        const at = (fn: typeof low, lat: number): number => {
            const w = balancedWind(pressureStencil(fn, 300e3, 0, 2000), coriolis(lat), FREE_DRAG);
            return counterclockwise(300e3, 0, w.east, w.north);
        };
        // Act / Assert
        expect(at(low, 45)).toBeGreaterThan(5);
        expect(at(low, -45)).toBeLessThan(-5);
        expect(at(high, 45)).toBeLessThan(-2);
        expect(at(high, -45)).toBeGreaterThan(2);
    });

    it('isóbaras retas: Guldberg–Mohn — o vento cruza as isóbaras para a baixa com o ângulo atan(r/f)', () => {
        // Arrange: a pressão sobe para o leste (1 hPa/100 km)
        const fn = (x: number): number => 1e-3 * x;
        const f = coriolis(45);
        const r = 6e-5;
        // Act
        const w = balancedWind(pressureStencil(fn, 0, 0, 1000), f, r);
        // Assert: |U| = |G|/√(r² + f²), para o oeste (a baixa) com o ângulo atan(r/f) sobre as isóbaras (norte–sul)
        const G = 1e-3 / AIR_DENSITY;
        expect(Math.hypot(w.east, w.north)).toBeCloseTo(G / Math.hypot(r, f), 6);
        expect(w.east).toBeLessThan(0);
        expect(Math.atan2(-w.east, w.north)).toBeCloseTo(Math.atan2(r, f), 6);
    });

    it('o equador: o vento desce o gradiente (antitríptico), finito e contínuo na latitude', () => {
        // Arrange: a baixa padrão na amplitude da latitude (a anomalia escala com f_e)
        const sample = (lat: number): [number, number] => {
            const f = coriolis(lat);
            const fn = gaussian(-patternAmplitude(1500, f), sigma);
            const w = balancedWind(pressureStencil(fn, 300e3, 0, 2000), f, FREE_DRAG);
            return [w.east, w.north];
        };
        // Act
        const [e0, n0] = sample(0);
        // Assert: no equador nada gira; o vento aponta para o centro (oeste) e é finito
        expect(Math.abs(n0)).toBeLessThan(1e-9);
        expect(e0).toBeLessThan(0);
        expect(Math.abs(e0)).toBeLessThan(40);
        // contínuo: passos de 0,05° entre −3° e 3° mudam o vento menos de 1 m/s (a derivada mais forte, ~7 m/s por grau,
        // fica entre 0,5° e 1°: o giro nascendo), e o norte e o sul são espelhos
        let previous = sample(-3);
        for (let lat = -2.95; lat <= 3.0001; lat += 0.05) {
            const now = sample(lat);
            expect(Math.hypot(now[0] - previous[0], now[1] - previous[1])).toBeLessThan(1);
            const mirror = sample(-lat);
            expect(now[0]).toBeCloseTo(mirror[0], 9);
            expect(now[1]).toBeCloseTo(-mirror[1], 9);
            previous = now;
        }
    });

    it('a rotação efetiva nunca é nula e a amplitude padrão é a dada a 45°', () => {
        expect(effectiveRotation(0, FREE_DRAG)).toBe(FREE_DRAG);
        expect(patternAmplitude(1500, coriolis(45))).toBeCloseTo(1500, 9);
        expect(patternAmplitude(1500, coriolis(0))).toBeLessThan(200);
        expect(coriolis(90)).toBeCloseTo(2 * 7.2921159e-5, 12);
    });
});

describe('cloudWeather — subida, subsidência e frentes (R19)', () => {
    it('Ekman: w no centro da baixa gaussiana = H·r·∇²p/(ρ(r² + f²)) > 0; na alta, < 0', () => {
        // Arrange
        const sigma = 400e3;
        const f = coriolis(45);
        const r = 6e-5;
        // Act
        const wLow = ekmanVelocity(pressureStencil(gaussian(-1500, sigma), 0, 0, 2000), f, r);
        const wHigh = ekmanVelocity(pressureStencil(gaussian(800, sigma), 0, 0, 2000), f, r);
        // Assert: ∇²p no centro = −2A/σ²
        const lap = (2 * 1500) / (sigma * sigma);
        const expected = (BOUNDARY_LAYER_DEPTH * r * lap) / (AIR_DENSITY * (r * r + f * f));
        expect(Math.abs(wLow / expected - 1)).toBeLessThan(1e-4);
        expect(wLow).toBeGreaterThan(0.01);
        expect(wHigh).toBeLessThan(0);
        // com r ≪ f, a forma de Ekman w = (H r / f)·ζ_g
        const rSmall = 1e-6;
        const w = ekmanVelocity(pressureStencil(gaussian(-1500, sigma), 0, 0, 2000), f, rSmall);
        const zeta = lap / (AIR_DENSITY * f);
        // (a diferença relativa é r²/f² ~ 1e−4 mais o estêncil)
        expect(Math.abs(w / (((BOUNDARY_LAYER_DEPTH * rSmall) / f) * zeta) - 1)).toBeLessThan(1e-3);
    });

    it('Okubo–Weiss: rotação pura W < 0, deformação pura W > 0', () => {
        const f = coriolis(45);
        const spin = okuboWeiss(
            pressureStencil((x, z) => x * x + z * z, 0, 0, 10),
            f,
            0,
        );
        const strain = okuboWeiss(
            pressureStencil((x, z) => x * x - z * z, 0, 0, 10),
            f,
            0,
        );
        expect(spin).toBeLessThan(0);
        expect(strain).toBeGreaterThan(0);
    });

    it('a frente acende entre uma baixa e uma alta vizinhas e não em volta de um sistema isolado', () => {
        // Arrange: os sistemas do padrão (núcleo de suporte compacto)
        const L = 1.5e6;
        const f = coriolis(45);
        const cap = highAmplitudeCap(L, f);
        const low = (x: number, z: number, cx: number): number =>
            -1200 * bump((x - cx) ** 2 + z * z, 0.75 * L);
        const high = (x: number, z: number, cx: number): number =>
            cap * bump((x - cx) ** 2 + z * z, L);
        const most = (fn: (x: number, z: number) => number): number => {
            let m = 0;
            for (let x = -1.5e6; x <= 1.5e6; x += 25e3)
                for (let z = -1.2e6; z <= 1.2e6; z += 25e3)
                    m = Math.max(
                        m,
                        frontIntensity(pressureStencil(fn, x, z, L / 64), f, FREE_DRAG),
                    );
            return m;
        };
        // Act
        const alone = most((x, z) => low(x, z, 0));
        const aloneHigh = most((x, z) => high(x, z, 0));
        const pair = most((x, z) => low(x, z, -0.5 * L) + high(x, z, 0.5 * L));
        // Assert
        expect(alone).toBe(0);
        expect(aloneHigh).toBe(0);
        expect(pair).toBeGreaterThan(0.5);
    });

    it('o mapeamento: subida → cúmulo-nimbo até a tropopausa; subsidência → céu limpo raso; frente → faixa', () => {
        const fair = { coverage: 0.4, type: 0.5, top: 0.25 };
        expect(weatherClouds(0, 0, fair)).toEqual(fair);
        const storm = weatherClouds(0.05, 0, fair);
        expect(storm.type).toBe(1);
        expect(storm.top).toBe(1);
        expect(storm.coverage).toBeCloseTo(0.75, 9);
        const high = weatherClouds(-0.05, 0, fair);
        expect(high.coverage).toBeCloseTo(0.1, 9);
        expect(high.type).toBeCloseTo(0.25, 9);
        expect(high.top).toBeCloseTo(0.15, 9);
        const front = weatherClouds(0, 1, fair);
        expect(front.coverage).toBeCloseTo(0.85, 9);
        expect(front.type).toBeCloseTo(0.3, 9);
        expect(front.top).toBeCloseTo(0.55, 9);
        // na subsidência, sem faixa frontal (o anel em volta de um vórtice intenso)
        expect(weatherClouds(-0.05, 1, fair)).toEqual(high);
    });

    it('o estado relaxa para o alvo como e^(−Δt/τ), e dois meios passos são um passo', () => {
        const before = { coverage: 0.9, type: 1, top: 1 };
        const target = { coverage: 0.1, type: 0.25, top: 0.2 };
        const one = weatherRelax(before, target, 600, 1200);
        const two = weatherRelax(weatherRelax(before, target, 300, 1200), target, 300, 1200);
        expect(one.coverage).toBeCloseTo(0.1 + 0.8 * Math.exp(-0.5), 12);
        expect(two.coverage).toBeCloseTo(one.coverage, 12);
        expect(two.type).toBeCloseTo(one.type, 12);
        expect(weatherRelax(undefined, target, 1, 1)).toEqual(target);
    });

    it('weatherAt: o vento de condução soma, a pressão anda com ele', () => {
        // Arrange: uma baixa no referencial; o vento de condução de 10 m/s para leste por 1 dia
        const fn = (x: number, z: number): number => gaussian(-1500, 400e3)(x, z);
        const q = {
            f: coriolis(45),
            freeDrag: FREE_DRAG,
            friction: 6e-5,
            step: 2000,
            steering: [10, 0] as const,
            time: 86_400,
        };
        // Act: o centro da baixa está em x = 864 km
        const center = weatherAt(fn, 864e3, 0, q);
        // Assert
        expect(center.pressure).toBeCloseTo(-1500, 3);
        expect(center.windX).toBeCloseTo(10, 6);
        expect(center.windZ).toBeCloseTo(0, 6);
        expect(center.w).toBeGreaterThan(0.01);
    });
});

describe('cloudWeather — o padrão de sistemas (R19)', () => {
    const f = coriolis(45);
    const pattern: PressurePattern = {
        scale: 1.5e6,
        amplitude: 1200,
        highCap: highAmplitudeCap(1.5e6, f),
        lifetime: 2 * 86_400,
        seed: 7,
    };

    it('no tempo: nascem, crescem e se desfazem sem salto (a troca de geração com o sistema extinto)', () => {
        // Arrange
        const points = [
            [120e3, -340e3],
            [2.2e6, 0.9e6],
            [-0.7e6, 3.1e6],
        ];
        for (const [x, z] of points) {
            let previous = defaultPressure(x!, z!, 0, pattern);
            let lowest = 0;
            // Act: 4 vidas em passos de 10 min
            for (let t = 600; t <= 4 * pattern.lifetime; t += 600) {
                const p = defaultPressure(x!, z!, t, pattern);
                // Assert: 10 min mudam a pressão no máximo ~1 % da amplitude
                expect(Math.abs(p - previous)).toBeLessThan(0.012 * pattern.amplitude);
                lowest = Math.min(lowest, p);
                previous = p;
            }
            expect(lowest).toBeLessThan(0);
        }
        // a amplitude de um sistema é zero no nascimento: a geração muda onde o envelope zera
        const s = patternSystem(3, -2, 0, pattern);
        expect(Math.abs(s.amplitude)).toBeLessThanOrEqual(pattern.amplitude);
    });

    it('no espaço: contínuo e de laplaciano contínuo na borda das células (o núcleo C²)', () => {
        const t = 0.37 * pattern.lifetime;
        for (const z of [-0.4e6, 0.2e6, 0.9e6]) {
            const edge = 3 * pattern.scale;
            const left = pressureStencil(
                (a, b) => defaultPressure(a, b, t, pattern),
                edge - 1,
                z,
                20e3,
            );
            const right = pressureStencil(
                (a, b) => defaultPressure(a, b, t, pattern),
                edge + 1,
                z,
                20e3,
            );
            expect(Math.abs(left.p - right.p)).toBeLessThan(1e-2);
            expect(Math.abs(left.pEE + left.pNN - (right.pEE + right.pNN))).toBeLessThan(1e-11);
        }
    });

    it('as altas ficam no ramo regular do vento gradiente (o teto pela latitude)', () => {
        // Arrange: |G|·κ no centro de uma alta `A(1 − d²/R²)³` é 6A/(ρR²)
        const R = pattern.scale;
        // Act / Assert
        expect((6 * pattern.highCap) / (AIR_DENSITY * R * R)).toBeLessThan((f * f) / 4);
        expect(highAmplitudeCap(R, coriolis(5))).toBeLessThan(highAmplitudeCap(R, f));
    });
});

describe('cloudModel — topo local e bigorna do cúmulo-nimbo (R19)', () => {
    /** Camada homogênea (volumes constantes) com cobertura, tipo e topo fixos. */
    const model = (coverage: number, type: number, top?: number): CloudModel => {
        // A forma 1 com o fBm de Worley na média das térmicas (sem desvio: a torre pelo tipo do mapa).
        const one = buildVolume(
            () => [1, CLOUD_TOWER_THERMAL.mean, CLOUD_TOWER_THERMAL.mean, CLOUD_TOWER_THERMAL.mean],
            2,
            false,
        );
        const zero = buildVolume(() => [0, 0, 0, 0], 2);
        return {
            groundRadius: 6_360_200,
            base: 1500,
            top: 11_500,
            coverage: () => (top === undefined ? [coverage, type, 1] : [coverage, type, 1, top]),
            density: 0.04,
            albedo: 0.99,
            shape: one,
            detail: zero,
            shapeScale: 12000,
            detailScale: 1800,
            shapeOffset: [0, 0, 0],
            detailOffset: [0, 0, 0],
            windDir: [1, 0],
        };
    };
    const at = (m: CloudModel, h: number): number =>
        cloudDensity(m, [0, m.base + h * (m.top - m.base), 0]);

    it('sem o quarto valor, igual ao topo 1; com topo 0,25 o perfil acaba em 25 % da casca', () => {
        const a = model(0.6, 0.5);
        const b = model(0.6, 0.5, 1);
        for (const h of [0.05, 0.3, 0.6, 0.9]) expect(at(a, h)).toBe(at(b, h));
        const low = model(0.6, 0.5, 0.25);
        expect(at(low, 0.3)).toBe(0);
        expect(at(low, 0.1)).toBeCloseTo(at(a, 0.4), 12);
    });

    it('a água da torre: 1 até o topo do tempo bom, 1 + ganho 3 km acima, o gelo da bigorna depois da glaciação', () => {
        // Act / Assert
        expect(towerWater(2000, 2800)).toBe(1);
        expect(towerWater(2800 + CLOUD_WATER.depth / 2, 2800)).toBeCloseTo(
            1 + CLOUD_WATER.gain / 2,
            12,
        );
        // o topo da torre glaciado é o gelo da bigorna: a torre e a bigorna, um meio contínuo
        expect(towerWater(CLOUD_WATER.glaciation[1], 2800)).toBeCloseTo(CLOUD_ANVIL.water, 12);
        // sem o tempo (o topo do tempo bom é o da casca), 1 em toda a casca
        for (const a of [1500, 4000, 7000, 11_000]) expect(towerWater(a, 11_500)).toBe(1);
        const a = model(0.6, 1);
        const w = { ...a, weather: { fairTop: 0.2, anvilOffset: [0, 0] as const } };
        // Com o tempo, a torre mais forte e o topo do estado na casca: a densidade a 5 km é a de sem o tempo × a água
        // (forma 1, detalhe 0), o dobro (1,5 km acima do topo do tempo bom, antes da glaciação)
        expect(towerWater(5000, 3500)).toBeCloseTo(2, 12);
        expect(at(w, 0.35)).toBeCloseTo(at(a, 0.35) * 2, 6);
    });

    it('a torre sobe até o topo do estado só na célula mais forte (o alcance pelo tipo local)', () => {
        // Arrange: topo do estado 1, tempo bom 0,2
        const tower = (type: number): CloudModel => ({
            ...model(0.6, type, 1),
            coverage: () => [0.6, type, 0, 1],
            weather: { fairTop: 0.2, anvilOffset: [0, 0] },
        });
        const highest = (m: CloudModel): number => {
            let h = 0;
            for (let k = 1; k < 1000; k++) if (at(m, k / 1000) > 0) h = k / 1000;
            return h;
        };
        // Act / Assert
        // a convecção trimodal: o raso, o congesto (0,4 do caminho) e o profundo
        expect(towerReach(0.95)).toBe(1);
        expect(towerReach(0.65)).toBeCloseTo(CLOUD_CONGESTUS_REACH, 12);
        expect(towerReach(0.3)).toBe(0);
        expect(highest(tower(1))).toBeGreaterThan(0.85);
        expect(highest(tower(0.75))).toBeLessThan(0.2 + 0.8 * towerReach(0.75) + 1e-3);
        expect(highest(tower(0.65))).toBeGreaterThan(0.2 + 0.8 * CLOUD_CONGESTUS_REACH * 0.5);
        expect(highest(tower(0.65))).toBeLessThan(0.2 + 0.8 * CLOUD_CONGESTUS_REACH + 1e-3);
        expect(highest(tower(0.3))).toBeLessThanOrEqual(0.2);
    });

    it('a bigorna: a lâmina abaixo da tropopausa pela cobertura dela, sem nuvem de torre embaixo', () => {
        // Arrange: sem cobertura de torre e com a bigorna 0,8 (o terceiro valor com o tempo)
        const m: CloudModel = {
            ...model(0, 1, 1),
            coverage: () => [0, 1, 0.8, 1],
            weather: { fairTop: 0.2, anvilOffset: [0, 0] },
        };
        const alt = (h: number): number => 1500 + h * 10_000;
        // Act / Assert: a forma 1 com o perfil P dá `remap(P, 0,2, 1)·0,8` × a água do gelo, depois da erosão 1 − hf (0 → 1)
        for (const h of [0.5, 0.75, 0.8, 0.85, 0.9, 0.95]) {
            const P = anvilProfile(alt(h), 11_500);
            const c = P > 0 ? Math.max(0, remap(P, 0.2, 1, 0, 1) * 0.8) : 0;
            const eroded = Math.max(0, remap(c, 0.35, 1, 0, 1));
            expect(at(m, h)).toBeCloseTo(eroded * CLOUD_ANVIL.water, 12);
        }
        expect(at(m, 0.5)).toBe(0);
        expect(at(m, 0.85)).toBeGreaterThan(0);
        // sem o tempo o terceiro valor é a densidade relativa: nada de bigorna
        const plain: CloudModel = { ...m, coverage: m.coverage };
        delete (plain as { weather?: unknown }).weather;
        expect(at(plain, 0.85)).toBe(0);
    });
});

describe('cloudModel — as térmicas, os cúmulos rasos e o ambiente local da torre (R19, rodada 9)', () => {
    it('as térmicas: sem desvio na média do fBm de Worley; a bolha forte sobe e alarga com a subida', () => {
        // Act / Assert
        expect(towerThermal(CLOUD_TOWER_THERMAL.mean, 1)).toEqual([0, 0]);
        const [dt, dc] = towerThermal(CLOUD_TOWER_THERMAL.mean + 0.2, 1);
        expect(dt).toBeCloseTo(0.2 * CLOUD_TOWER_THERMAL.reach, 12);
        expect(dc).toBeCloseTo(0.2 * CLOUD_TOWER_THERMAL.width, 12);
        // na base da subida a largura não muda
        expect(towerThermal(CLOUD_TOWER_THERMAL.mean + 0.2, 0)[1]).toBe(0);
    });

    it('a erosão dos rasos: a do tempo bom no topo dele e nas torres, mais forte sob a inversão baixada', () => {
        // Act / Assert
        expect(shallowErosion(0.163, 0.163)).toBe(CLOUD_EROSION);
        expect(shallowErosion(1, 0.163)).toBe(CLOUD_EROSION);
        expect(shallowErosion(0.6 * 0.163, 0.163)).toBe(CLOUD_SHALLOW_EROSION);
        expect(shallowErosion(0.8 * 0.163, 0.163)).toBeGreaterThan(CLOUD_EROSION);
    });

    it('a transmitância difusa: 1 sem nuvem, 1/(1 + ¾(1 − g)τ)', () => {
        expect(diffuseTransmittance(0)).toBe(1);
        expect(diffuseTransmittance(100)).toBeCloseTo(
            1 / (1 + 0.75 * (1 - CLOUD_DIFFUSE_ASYMMETRY) * 100),
            12,
        );
    });

    it('a base da torre de 10 km contra o topo iluminado: a razão do traçador f64', () => {
        // Arrange: um cilindro de 3 km de raio da base (1200 m) à tropopausa (11 km), cúmulo-nimbo maduro (cobertura 1,
        // tipo 1, topo do estado 1, o tempo bom a 2,8 km), extinção 0,02/m; o sol a 40°, o céu uniforme e o chão de
        // albedo 0,1. A verdade: o rastreamento delta no meio truncado (δ-M) com o céu e o chão; a marcha: as oitavas e
        // o ambiente local (`ambientLocal`).
        const one = buildVolume(() => [1, 0.55, 0.55, 0.55], 2, false);
        const zero = buildVolume(() => [0, 0, 0, 0], 2);
        const R = 3000;
        const m: CloudModel = {
            groundRadius: 6_360_200,
            base: 1200,
            top: 11_000,
            coverage: (x, z) => (x * x + z * z <= R * R ? [1, 1, 0, 1] : [0, 1, 0, 1]),
            density: 0.02,
            albedo: 0.99,
            shape: one,
            detail: zero,
            shapeScale: 12000,
            detailScale: 1800,
            shapeOffset: [0, 0, 0],
            detailOffset: [0, 0, 0],
            windDir: [1, 0],
            weather: { fairTop: 0.163, anvilOffset: [0, 0] },
        };
        const e = (40 * Math.PI) / 180;
        const sun: Vec3 = [Math.cos(e), Math.sin(e), 0];
        const sky = 0.05;
        const albedo = 0.1;
        const p = jdeParams(20);
        const t = phaseTruncation(p);
        const kT = 1 - m.albedo * t.fc;
        const scene: PtDeltaScene = {
            medium: {
                majorant: m.density * kT * (1 + CLOUD_WATER.gain),
                extinction: (x) => cloudDensity(m, x) * m.density * kT,
                albedo: (m.albedo * (1 - t.fc)) / kT,
                phase: tabulatePhase((c) => truncatedPhase(c, p, t)),
                spans: (o, d, tMax) => shellSegments(m, o, d, tMax),
            },
            sunDir: sun,
            sun: [1, 1, 1],
            sky: () => [sky, sky, sky],
            ground: { height: 0, albedo: [albedo, albedo, albedo] },
        };
        const down = albedo * (Math.sin(e) / Math.PI + sky);
        const light = {
            sunDir: sun,
            sun: [1, 1, 1] as Vec3,
            ambientUp: [sky, sky, sky] as Vec3,
            ambientDown: [down, down, down] as Vec3,
        };
        const view = (o: Vec3, d: Vec3, seed: number): { truth: number; march: number } => {
            let s = 0;
            const n = 8000;
            for (let k = 0; k < n; k++)
                s += deltaTrackRadiance(scene, o, d, deltaRng(seed, k), 1 << 16)[0];
            const march = marchCloud(
                m,
                o,
                d,
                Infinity,
                light,
                p,
                { count: 3, a: 0.5, b: 0.5, c: 0.5 },
                512,
                64,
            );
            return { truth: s / n, march: march.scattered[0] };
        };
        // Act: a base vista de baixo, no centro; o topo iluminado visto de cima
        const base = view([0, 0, 0], [0, 1, 0], 11);
        const top = view([0, 20_000, 0], [0, -1, 0], 13);
        // Assert: a razão base/topo da marcha a ±60 % da do traçador (medido: verdade 0,077 — base 0,0082, topo 0,106 —,
        // marcha 0,038 — base 0,0023, topo 0,062 —; sem a oclusão do ambiente pela coluna a marcha dava 0,386, a base 3,2 ×
        // a verdade: cinza). A oclusão por uma amostra da coluna (o custo do shader) escurece a base de uma torre estreita
        // além da verdade (a luz que vaza pelos lados vem dos caminhos das sondas, que pesam ≥ 80 % na GPU).
        const truth = base.truth / top.truth;
        const march = base.march / top.march;
        expect(truth).toBeGreaterThan(0.05);
        expect(truth).toBeLessThan(0.2);
        expect(
            Math.abs(march / truth - 1),
            `${base.truth} ${top.truth} ${base.march} ${top.march}`,
        ).toBeLessThan(0.6);
    }, 120_000);
});
