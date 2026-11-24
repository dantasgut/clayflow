import { describe, expect, it } from 'vitest';
import {
    aerialColumn,
    aerialPerspective,
    earthAtmosphere,
    multipleScattering,
    type SunVisibility,
    type Vec3,
} from '../atmosphere';

// Raios crepusculares (spec 041): o feixe de luz entre duas nuvens na perspectiva aérea — a coluna da tabela (o espelho
// f64 do kernel `sky_aerial`: 32 fatias quadráticas até 32 km, 4 subpassos, a visibilidade do sol no meio de cada um)
// contra a integral exata (a mesma luz com passos de ~1,6 m), e o déficit da sombra no fundo até 150 km.

const atmosphere = earthAtmosphere();
const R = atmosphere.bottomRadius;
/** O sol a 10° de elevação, de lado para a vista (+x): as sombras das nuvens cortam o raio da câmera. */
const elevation = (10 * Math.PI) / 180;
const sun: Vec3 = [Math.cos(elevation), Math.sin(elevation), 0];
/** A câmera a 200 m olhando rente ao chão para +z, 1° acima do horizonte. */
const lift = Math.PI / 180;
const view: Vec3 = [0, Math.sin(lift), Math.cos(lift)];

const msCache = new Map<string, Vec3>();
const ms = (r: number, muS: number): Vec3 => {
    const key = `${(r * 4).toFixed(0)}:${(muS * 200).toFixed(0)}`;
    let v = msCache.get(key);
    if (v === undefined) {
        v = multipleScattering(
            atmosphere,
            Math.round(r * 4) / 4,
            Math.round(muS * 200) / 200,
            16,
            12,
        );
        msCache.set(key, v);
    }
    return v;
};

/** Uma nuvem como caixa (km, sistema do planeta) de extinção `sigma` (1/km). */
interface Box {
    readonly min: Vec3;
    readonly max: Vec3;
    readonly sigma: number;
}

/** A corda do raio `x + s·d` (s > 0) dentro da caixa (slab). */
function chord(x: Vec3, d: Vec3, b: Box): number {
    let t0 = 0;
    let t1 = Infinity;
    for (let c = 0; c < 3; c++) {
        if (Math.abs(d[c]!) < 1e-12) {
            if (x[c]! < b.min[c]! || x[c]! > b.max[c]!) return 0;
            continue;
        }
        const a = (b.min[c]! - x[c]!) / d[c]!;
        const e = (b.max[c]! - x[c]!) / d[c]!;
        t0 = Math.max(t0, Math.min(a, e));
        t1 = Math.min(t1, Math.max(a, e));
    }
    return Math.max(0, t1 - t0);
}

/**
 * Duas nuvens de 1,5 a 2,5 km de altitude (extinção 3/km: ~0,05 de transmitância no centro), do lado do sol a 6–14 km do
 * raio da câmera — a sombra delas desce a 10° até a altitude do raio —, uma de 3 a 6 km ao longo da vista, outra de 8 a
 * 12 km: o ar sob elas fica na sombra, o vão de 6 a 8 km é o feixe de luz.
 */
const clouds: readonly Box[] = [
    { min: [6, R + 1.5, 3], max: [14, R + 2.5, 6], sigma: 3 },
    { min: [6, R + 1.5, 8], max: [14, R + 2.5, 12], sigma: 3 },
];
const visibility: SunVisibility = (x) =>
    Math.exp(-clouds.reduce((tau, b) => tau + b.sigma * chord(x, sun, b), 0));
const clear: SunVisibility = () => 1;

const luminance = (v: Vec3): number => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];

describe('raios crepusculares na perspectiva aérea (spec 041)', () => {
    const column = aerialColumn(atmosphere, 0.2, view, sun, ms, visibility);
    const free = aerialColumn(atmosphere, 0.2, view, sun, ms, clear);

    it('o ar na sombra das nuvens não espalha o sol; o feixe entre elas, sim', () => {
        // A luz que cada fatia acrescenta, por km, com e sem as nuvens.
        const gain = (c: typeof column, k: number): number =>
            (luminance(c.scattered[k]!) - luminance(k === 0 ? [0, 0, 0] : c.scattered[k - 1]!))
            / (c.distance[k]! - (k === 0 ? 0 : c.distance[k - 1]!));
        const inside = (from: number, to: number): number[] =>
            column.distance
                .map((d, k) => [d, k] as const)
                .filter(([d, k]) => (k === 0 ? 0 : column.distance[k - 1]!) >= from && d <= to)
                .map(([, k]) => k);
        // Fatias inteiras dentro da sombra (3,3–5,7 km, 8,3–11,7 km) e dentro do feixe (6,1–7,9 km).
        const shade = [...inside(3.3, 5.7), ...inside(8.3, 11.7)];
        const beam = inside(6.1, 7.9);
        expect(shade.length).toBeGreaterThan(2);
        expect(beam.length).toBeGreaterThan(0);
        for (const k of shade) expect(gain(column, k)).toBeLessThan(0.6 * gain(free, k));
        for (const k of beam) expect(gain(column, k)).toBeCloseTo(gain(free, k), 6);
    });

    it('a coluna da tabela segue a integral exata (fim de cada fatia, até 32 km)', () => {
        let worst = 0;
        for (let k = 0; k < column.distance.length; k++) {
            const d = column.distance[k]!;
            const exact = aerialPerspective(
                atmosphere,
                0.2,
                view,
                sun,
                d,
                Math.ceil(d * 600),
                ms,
                visibility,
            );
            const lum = luminance(exact.scattered);
            for (let c = 0; c < 3; c++)
                worst = Math.max(
                    worst,
                    Math.abs(column.scattered[k]![c]! - exact.scattered[c]!) / lum,
                );
        }
        // Medido: 1,35 % aos 12,5 km (o subpasso de ~0,2 km nas fatias de 8–13 km corta a borda da sombra no meio dele;
        // a integral exata convergida a 10⁻⁴).
        expect(worst).toBeLessThan(0.015);
    });

    it('o déficit da sombra no fundo é a diferença exata da luz espalhada até o fim do mapa', () => {
        const d = 150;
        const exactFree = aerialPerspective(atmosphere, 0.2, view, sun, d, 60000, ms, clear);
        const exactShadow = aerialPerspective(atmosphere, 0.2, view, sun, d, 60000, ms, visibility);
        const deficit: Vec3 = [0, 1, 2].map(
            (c) => exactFree.scattered[c]! - exactShadow.scattered[c]!,
        ) as unknown as Vec3;
        expect(luminance(deficit)).toBeGreaterThan(0.05 * luminance(exactFree.scattered));
        // Medido: 2,5 % do déficit (o resto além de 32 km em trechos de ~3,7 km; o déficit é 7 % da luz do caminho).
        for (let c = 0; c < 3; c++)
            expect(Math.abs(column.deficit[c]! - deficit[c]!)).toBeLessThan(
                0.03 * luminance(deficit),
            );
        // Sem nuvens, nenhum déficit.
        expect(free.deficit).toEqual([0, 0, 0]);
    });
});
