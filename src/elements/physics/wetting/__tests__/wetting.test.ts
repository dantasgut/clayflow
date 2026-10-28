import { describe, expect, it } from 'vitest';
import {
    absorbedAfter,
    absorbedEvaporationRate,
    contactLineRetention,
    evaporationRate,
    filmSurfaceTerms,
    filmVelocity,
    pinnedThickness,
    porousCapacity,
    saturationVaporPressure,
    washburnCoefficient,
    wenzelCos,
} from '../wetting';
import { SurfacePhysics } from '../SurfacePhysics';
import { Atmosphere } from '../Atmosphere';

const WATER = { surfaceTension: 0.072, contactAngle: 30, viscosity: 0.001, density: 1000 };
const AIR = { temperature: 20, relativeHumidity: 0.5, windSpeed: 0 };

/** Erro relativo. */
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe('a física da água que molha (spec 034)', () => {
    it('pressão de saturação (Magnus): as tabelas de vapor a 0, 20 e 40 °C dentro de 0,4 %', () => {
        expect(rel(saturationVaporPressure(0), 0.6112)).toBeLessThan(0.004);
        expect(rel(saturationVaporPressure(20), 2.339)).toBeLessThan(0.004);
        expect(rel(saturationVaporPressure(40), 7.384)).toBeLessThan(0.004);
    });

    it('evaporação (Carrier): água parada num cômodo a 20 °C e 50 % seca 1–5 mm por dia; cresce com o calor, o vento e o ar seco; nada com ar saturado', () => {
        const room = evaporationRate({
            airTemperature: 20,
            surfaceTemperature: 20,
            relativeHumidity: 0.5,
            windSpeed: 0,
        });
        const perDay = room * 86400 * 1000;
        expect(perDay).toBeGreaterThan(1);
        expect(perDay).toBeLessThan(5);
        expect(
            evaporationRate({
                airTemperature: 20,
                surfaceTemperature: 20,
                relativeHumidity: 1,
                windSpeed: 0,
            }),
        ).toBe(0);
        expect(
            evaporationRate({
                airTemperature: 30,
                surfaceTemperature: 30,
                relativeHumidity: 0.5,
                windSpeed: 0,
            }),
        ).toBeGreaterThan(room);
        expect(
            evaporationRate({
                airTemperature: 20,
                surfaceTemperature: 20,
                relativeHumidity: 0.2,
                windSpeed: 0,
            }),
        ).toBeGreaterThan(room);
        const windy = evaporationRate({
            airTemperature: 20,
            surfaceTemperature: 20,
            relativeHumidity: 0.5,
            windSpeed: 2,
        });
        expect(windy / room).toBeCloseTo((0.089 + 0.0782 * 2) / 0.089, 10);
        // Superfície mais fria que o ponto de orvalho do ar: orvalho, sem evaporação.
        expect(
            evaporationRate({
                airTemperature: 25,
                surfaceTemperature: 5,
                relativeHumidity: 0.8,
                windSpeed: 0,
            }),
        ).toBe(0);
    });

    it('Wenzel: a rugosidade amplia o que o material é e grampeia em molhar tudo', () => {
        expect(wenzelCos(60, 1.5)).toBeCloseTo(0.75, 12);
        expect(wenzelCos(120, 1.5)).toBeCloseTo(-0.75, 12);
        expect(wenzelCos(10, 1.6)).toBe(1);
    });

    it('Furmidge: a borda segura γ (cos θr − cos θa); a rugosidade aumenta; a película presa numa parede lisa de 6,25 mm é ~0,1 mm', () => {
        const smooth = contactLineRetention({
            surfaceTension: 0.072,
            contactAngle: 30,
            hysteresis: 10,
            roughness: 1,
        });
        expect(smooth).toBeCloseTo(
            0.072 * (Math.cos((25 * Math.PI) / 180) - Math.cos((35 * Math.PI) / 180)),
            12,
        );
        expect(rel(pinnedThickness(smooth, 9.81, 0.00625), 1.023e-4)).toBeLessThan(0.01);
        const base = { surfaceTension: 0.072, contactAngle: 60, hysteresis: 20 };
        expect(contactLineRetention({ ...base, roughness: 1.3 })).toBeGreaterThan(
            contactLineRetention({ ...base, roughness: 1 }),
        );
        expect(contactLineRetention({ ...base, hysteresis: 0, roughness: 1 })).toBe(0);
        expect(pinnedThickness(smooth, 0, 0.01)).toBe(Infinity);
    });

    it('Nusselt: a película fina desce a g h² / (3ν), freada pela rugosidade', () => {
        expect(filmVelocity(1e-4, 9.81, 1e-6)).toBeCloseTo(0.0327, 4);
        expect(filmVelocity(1e-4, 9.81, 1e-6, 2)).toBeCloseTo(0.0327 / 2, 4);
    });

    it('Washburn: os presets reproduzem a sortividade medida (concreto ~0,1, tijolo ~0,3 mm/√s); sem absorção com θ ≥ 90°', () => {
        const concrete = new SurfacePhysics(SurfacePhysics.CONCRETE);
        const brick = new SurfacePhysics(SurfacePhysics.BRICK);
        const s = (p: SurfacePhysics): number =>
            Math.sqrt(washburnCoefficient(p, 0.072, p.contactAngle!, 0.001));
        expect(rel(s(concrete), 1e-4)).toBeLessThan(0.02);
        expect(rel(s(brick), 3e-4)).toBeLessThan(0.02);
        expect(washburnCoefficient(concrete, 0.072, 95, 0.001)).toBe(0);
        // A frente cresce com √t até a capacidade φ × espessura.
        const w = washburnCoefficient(concrete, 0.072, 50, 0.001);
        expect(absorbedAfter(w, 1, 400) / absorbedAfter(w, 1, 100)).toBeCloseTo(2, 12);
        expect(porousCapacity(concrete)).toBeCloseTo(0.003, 12);
        expect(absorbedAfter(w, porousCapacity(concrete), 1e9)).toBeCloseTo(0.003, 12);
    });

    it('a água absorvida seca na taxa decrescente: a da água livre vezes a saturação', () => {
        expect(absorbedEvaporationRate(4e-8, 0.25)).toBeCloseTo(1e-8, 20);
        expect(absorbedEvaporationRate(4e-8, 2)).toBeCloseTo(4e-8, 20);
    });

    it('as grandezas da película por superfície: o padrão liso e impermeável, o concreto rugoso e poroso, a temperatura própria', () => {
        const smooth = filmSurfaceTerms(SurfacePhysics.defaults, WATER, AIR);
        expect(smooth.mobility).toBe(1);
        expect(smooth.washburn).toBe(0);
        expect(smooth.capacity).toBe(0);
        expect(smooth.retentionPerDensity).toBeCloseTo(
            contactLineRetention({
                surfaceTension: 0.072,
                contactAngle: 30,
                hysteresis: 10,
                roughness: 1,
            }) / 1000,
            15,
        );
        const concrete = filmSurfaceTerms(new SurfacePhysics(SurfacePhysics.CONCRETE), WATER, AIR);
        expect(concrete.mobility).toBeCloseTo(1 / 1.6, 12);
        expect(concrete.retentionPerDensity).toBeGreaterThan(smooth.retentionPerDensity);
        expect(concrete.washburn).toBeGreaterThan(0);
        const warm = filmSurfaceTerms(new SurfacePhysics({ temperature: 40 }), WATER, AIR);
        expect(warm.evaporation).toBeGreaterThan(smooth.evaporation);
    });
});

describe('SurfacePhysics e Atmosphere', () => {
    it('validam o domínio e expõem o que não foi dado como undefined', () => {
        expect(() => new SurfacePhysics({ roughness: 0.9 })).toThrow(RangeError);
        expect(() => new SurfacePhysics({ porosity: 1 })).toThrow(RangeError);
        expect(() => new SurfacePhysics({ hysteresis: -1 })).toThrow(RangeError);
        expect(() => new SurfacePhysics({ temperature: -300 })).toThrow(RangeError);
        const s = new SurfacePhysics();
        expect(s.contactAngle).toBeUndefined();
        expect(s.temperature).toBeUndefined();
        expect(new SurfacePhysics({ temperature: 35 }).temperature).toBe(35);
        expect(() => new Atmosphere({ relativeHumidity: 1.2 })).toThrow(RangeError);
        expect(() => new Atmosphere({ windSpeed: -1 })).toThrow(RangeError);
        expect(Atmosphere.defaults.temperature).toBe(20);
        expect(Atmosphere.defaults.relativeHumidity).toBe(0.5);
    });
});
