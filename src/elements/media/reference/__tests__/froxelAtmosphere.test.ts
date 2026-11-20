import { describe, expect, it } from 'vitest';
import {
    aerialColumn,
    aerialPerspective,
    earthAtmosphere,
    multipleScattering,
    type SunVisibility,
    type Vec3,
} from '../../../scene/reference/atmosphere';
import { froxelAtmosphereColumn, froxelLookup, nearFarAerial } from '../froxelAtmosphere';

// A atmosfera como meio dos froxels (spec 041, R21): o espelho f64 de uma coluna da grade (128 fatias exponenciais, a
// fonte média nos pontos sorteados, a extinção por canal no meio da fatia) contra a integral contínua (`aerialPerspective`
// com a mesma visibilidade e passos de ~1,7 m); o feixe de luz atrás de um bloqueador (o ar na sombra de uma colina) e a
// emenda perto/longe com a tabela da perspectiva aérea (32 fatias quadráticas).

const atmosphere = {
    ...earthAtmosphere(8),
    haze: { scattering: 0.18, extinction: 0.2, scale: 0.5 },
};
const R = atmosphere.bottomRadius;
/** O sol a 10° de elevação, 30° à direita da vista (+z): o espalhamento para a frente dos aerossóis, como nas fotos. */
const elevation = (10 * Math.PI) / 180;
const azimuth = (30 * Math.PI) / 180;
const sun: Vec3 = [
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
];
/** A câmera a 200 m olhando para +z, 1° acima do horizonte. */
const lift = Math.PI / 180;
const view: Vec3 = [0, Math.sin(lift), Math.cos(lift)];
const altitude = 0.2;

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

/** A corda do raio `x + s·d` (s > 0) dentro da caixa [min, max]. */
function chord(x: Vec3, d: Vec3, min: Vec3, max: Vec3): number {
    let t0 = 0;
    let t1 = Infinity;
    for (let c = 0; c < 3; c++) {
        if (Math.abs(d[c]!) < 1e-12) {
            if (x[c]! < min[c]! || x[c]! > max[c]!) return 0;
            continue;
        }
        const a = (min[c]! - x[c]!) / d[c]!;
        const e = (max[c]! - x[c]!) / d[c]!;
        t0 = Math.max(t0, Math.min(a, e));
        t1 = Math.min(t1, Math.max(a, e));
    }
    return Math.max(0, t1 - t0);
}

/**
 * Uma colina opaca entre o raio e o sol (0,3–0,7 km à direita, 600 m de altura, de 2,85 a 4,85 km ao longo da vista): o
 * ar do raio de ~2 a ~4 km fica na sombra dela; antes e depois, ao sol.
 */
const hill: SunVisibility = (x) =>
    chord(x, sun, [0.3, R - 1, 2.85], [0.7, R + 0.6, 4.85]) > 0 ? 0 : 1;
const clear: SunVisibility = () => 1;

const luminance = (v: Vec3): number => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
const exact = (d: number, visibility: SunVisibility): Vec3 =>
    aerialPerspective(atmosphere, altitude, view, sun, d, Math.ceil(d * 600), ms, visibility)
        .scattered;

describe('a atmosfera nos froxels (spec 041, R21)', () => {
    const shaded = froxelAtmosphereColumn(atmosphere, altitude, view, sun, ms, hill);
    const free = froxelAtmosphereColumn(atmosphere, altitude, view, sun, ms, clear);

    it('o feixe atrás de um bloqueador: a razão de radiância dentro/fora dele segue a integral', () => {
        // A luz que o ar entre a e b acrescenta (km), na coluna dos froxels e na integral contínua.
        const gainFx = (a: number, b: number): number =>
            luminance(froxelLookup(shaded, b)) - luminance(froxelLookup(shaded, a));
        const gainEx = (a: number, b: number): number =>
            luminance(exact(b, hill)) - luminance(exact(a, hill));
        const gainFree = (a: number, b: number): number =>
            luminance(froxelLookup(free, b)) - luminance(froxelLookup(free, a));
        // Na sombra (2,4–3,6 km) e ao sol logo depois (4,4–5,6 km): a mesma largura.
        const inFx = gainFx(2.4, 3.6);
        const outFx = gainFx(4.4, 5.6);
        const inEx = gainEx(2.4, 3.6);
        const outEx = gainEx(4.4, 5.6);
        const ratioFx = inFx / outFx;
        const ratioEx = inEx / outEx;
        console.log(
            `feixe: dentro/fora froxels ${ratioFx.toFixed(4)}, integral ${ratioEx.toFixed(4)}; sombra/livre ${(inFx / gainFree(2.4, 3.6)).toFixed(4)}`,
        );
        // A sombra tira a luz simples (Mie e Rayleigh do sol): fica a múltipla.
        expect(inFx).toBeLessThan(0.5 * gainFree(2.4, 3.6));
        // Medido: 0,2848 contra 0,2817 (1,1 %: as bordas da sombra cortam as fatias de ~250 m a 3 km).
        expect(Math.abs(ratioFx - ratioEx)).toBeLessThan(0.015 * ratioEx);
        expect(Math.abs(outFx - outEx)).toBeLessThan(0.03 * outEx);
    });

    it('a coluna dos froxels segue a integral contínua até o alcance', () => {
        let worst = 0;
        let where = 0;
        for (const d of [0.05, 0.3, 1, 1.9, 2.5, 3.5, 4.2, 6, 10, 16, 24, 31.9]) {
            const fx = froxelLookup(shaded, d);
            const ex = exact(d, hill);
            const e = Math.max(...[0, 1, 2].map((c) => Math.abs(fx[c]! - ex[c]!))) / luminance(ex);
            if (e > worst) {
                worst = e;
                where = d;
            }
        }
        console.log(`coluna: pior erro ${(worst * 100).toFixed(2)} % aos ${where} km`);
        // Medido: 1,28 % aos 4,2 km (a fatia que contém a borda da sombra; a integral convergida a 10⁻⁴).
        expect(worst).toBeLessThan(0.015);
    });

    it('a emenda perto/longe: sem luz contada duas vezes e sem degrau no fim dos froxels', () => {
        // Os froxels até 12 km (o plano distante da câmera aquém do alcance da tabela) e a tabela além.
        const reach = 12;
        const fx = froxelAtmosphereColumn(atmosphere, altitude, view, sun, ms, hill, {
            far: reach,
            range: reach,
        });
        const table = aerialColumn(atmosphere, altitude, view, sun, ms, hill);
        let worst = 0;
        for (const d of [6, 11, 11.9, 12, 12.1, 13, 16, 20, 26, 31.5]) {
            const s = nearFarAerial(fx, table, reach, d).scattered;
            const ex = exact(d, hill);
            worst = Math.max(
                worst,
                Math.max(...[0, 1, 2].map((c) => Math.abs(s[c]! - ex[c]!))) / luminance(ex),
            );
        }
        const below = nearFarAerial(fx, table, reach, reach - 1e-6).scattered;
        const above = nearFarAerial(fx, table, reach, reach + 1e-3).scattered;
        const step = Math.abs(luminance(above) - luminance(below)) / luminance(below);
        // Contar a luz duas vezes (a tabela inteira mais os froxels) daria o dobro do trecho perto.
        const twice = luminance(froxelLookup(fx, reach)) + luminance(table.scattered[31]!);
        console.log(
            `emenda: pior erro ${(worst * 100).toFixed(2)} %, degrau ${(step * 100).toFixed(4)} %, a 32 km ${luminance(nearFarAerial(fx, table, reach, 32).scattered).toFixed(5)} (contada duas vezes ${twice.toFixed(5)})`,
        );
        // Medido: 0,14 % (a tabela além dos froxels segue a integral; a 32 km, metade do que daria contada duas vezes) e um
        // degrau de 0,004 % no fim dos froxels.
        expect(worst).toBeLessThan(0.005);
        expect(step).toBeLessThan(5e-4);
        expect(twice).toBeGreaterThan(
            1.5 * luminance(nearFarAerial(fx, table, reach, 32).scattered),
        );
    });
});
