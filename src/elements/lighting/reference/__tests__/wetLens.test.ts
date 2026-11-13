import { describe, expect, it } from 'vitest';
import { capNormal, wetBackExit, wetExit, wetFateAcross, type V3, type WetPane } from '../wetLens';

/** A gota do vidro de janela (30°, 1 mm de raio de base) na lâmina de 4 mm, vista a 40° (a `molharperto`). */
const PANE: WetPane = {
    contact: Math.PI / 6,
    base: 1e-3,
    thickness: 4e-3,
    water: 1.333,
    glass: 1.5,
};
const VIEW = (40 * Math.PI) / 180;

function dot(a: V3, b: V3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: V3, b: V3, s = 1): V3 {
    return [a[0] - b[0] * s, a[1] - b[1] * s, a[2] - b[2] * s];
}

function norm(a: V3): V3 {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
}

/** `refract` do WGSL: `i` contra a normal `n`, razão `eta`; nula na reflexão total. */
function refractW(i: V3, n: V3, eta: number): V3 | null {
    const c = dot(n, i);
    const k = 1 - eta * eta * (1 - c * c);
    if (k < 0) return null;
    return sub([i[0] * eta, i[1] * eta, i[2] * eta], n, eta * c + Math.sqrt(k));
}

function reflectW(i: V3, n: V3): V3 {
    return sub(i, n, 2 * dot(n, i));
}

/**
 * O que `refraction_wet_normal` faz na saída do vidro pela gota (de dentro), em TS: a direção no ar (`out`) ou a de
 * volta no vidro (`back`), pela normal da água no ponto e as voltas pela inclinação oposta.
 */
function folded(d: V3, nw: V3): { kind: 'out' | 'back'; dir: V3 } | null {
    const n: V3 = [0, 0, 1];
    const slope = sub(n, nw);
    const t1 = refractW(d, [0, 0, -1], PANE.glass / PANE.water);
    if (t1 === null) return null;
    const t2 = refractW(t1, [-nw[0], -nw[1], -nw[2]], PANE.water);
    if (t2 !== null) return { kind: 'out', dir: norm(t2) };
    let r = reflectW(t1, nw);
    for (let k = 0; k < 4; k++) {
        if (dot(r, n) < 0) break;
        const s = k % 2 === 0 ? slope : ([-slope[0], -slope[1], -slope[2]] as V3);
        const nk = norm([n[0] + s[0], n[1] + s[1], n[2] + s[2]]);
        const out = refractW(r, [-nk[0], -nk[1], -nk[2]], PANE.water);
        if (out !== null) return { kind: 'out', dir: norm(out) };
        r = reflectW(r, nk);
    }
    if (dot(r, n) >= 0) r = sub(r, n, 2 * dot(r, n));
    const back = refractW(norm(r), n, PANE.water / PANE.glass);
    return back === null ? null : { kind: 'back', dir: norm(back) };
}

describe('wetLens — a gota no vidro visto de lado (T066d)', () => {
    it('conserva a energia: o que escapa, o que chega ao teto e o cortado somam 1 em cada raio', () => {
        for (const through of [false, true]) {
            for (const s of wetFateAcross(PANE, VIEW, 8, 12, through)) {
                const f = s.fate;
                expect(f.escaped + f.capped + f.pruned).toBeCloseTo(1, 10);
            }
        }
    });

    it('a gota vista através do vidro reflete inteira parte dos raios; a lâmina guia ~9 % da energia, não metade', () => {
        // O raio refratado do ar para o vidro na face da câmera (a face plana, paralela à da gota).
        const sinT = Math.sin(VIEW) / PANE.glass;
        const dg: V3 = [sinT, 0, Math.sqrt(1 - sinT * sinT)];
        let tir = 0;
        let total = 0;
        const n = 24;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const x = (((i + 0.5) / n) * 2 - 1) * PANE.base;
                const y = (((j + 0.5) / n) * 2 - 1) * PANE.base;
                if (x * x + y * y >= PANE.base * PANE.base) continue;
                const e = wetExit(PANE, x, y, dg);
                if (e === null) continue;
                total++;
                if (e.bounces > 0) tir++;
            }
        }
        expect(tir / total).toBeGreaterThan(0.1);
        // A energia que a reflexão total prende na lâmina (sem fim nela: a lâmina é infinita e só tem esta gota) é a
        // mesma com 8 e 32 interfaces — presa de verdade, sai por outras gotas e pela borda; é o que o traçado estima
        // pela luz de todas as direções no teto. Não é a meia gota preta (~50 % da área de um lado).
        const capped = (depth: number): number => {
            const fates = wetFateAcross(PANE, VIEW, depth, 24, true);
            return fates.reduce((a, s) => a + s.fate.capped, 0) / fates.length;
        };
        const c8 = capped(8);
        const c32 = capped(32);
        expect(c8).toBeLessThan(0.15);
        expect(Math.abs(c8 - c32)).toBeLessThan(0.01);
    });

    it('a dobra do traçado (a normal da água no ponto, as voltas pela inclinação oposta) segue a calota exata', () => {
        const sinT = Math.sin(VIEW) / PANE.glass;
        const dg: V3 = [sinT, 0, Math.sqrt(1 - sinT * sinT)];
        const errors: number[] = [];
        let kinds = 0;
        let total = 0;
        const n = 40;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const x = (((i + 0.5) / n) * 2 - 1) * PANE.base;
                const y = (((j + 0.5) / n) * 2 - 1) * PANE.base;
                if (x * x + y * y >= 0.9 * PANE.base * PANE.base) continue;
                const exact = wetExit(PANE, x, y, dg);
                const fold = folded(dg, capNormal(PANE, x, y));
                if (exact === null || fold === null) continue;
                total++;
                if (exact.kind !== fold.kind) continue;
                kinds++;
                errors.push(Math.acos(Math.min(Math.max(dot(exact.dir, fold.dir), -1), 1)));
            }
        }
        errors.sort((a, b) => a - b);
        const median = errors[Math.floor(errors.length / 2)]!;
        // O mesmo destino (sai pela calota ou volta ao vidro) em quase todos os raios, e a direção perto da exata: a
        // dobra é a gota fina (o raio acerta a calota acima do ponto da base), não o caminho exato dentro dela.
        expect(kinds / total).toBeGreaterThan(0.85);
        expect(median).toBeLessThan((10 * Math.PI) / 180);
    });

    it('na parede fina, o raio que a calota devolve sai do lado de onde veio, ou a lâmina o guia', () => {
        // Arrange: a vista rasante (75°), em que a calota devolve ao vidro 36 % dos raios (a 40°, 8 %); a lâmina guia
        // quase todos (a volta desce mais inclinada que o ângulo crítico do vidro para o ar), o shader os termina em
        // `scene_ambient` como no teto de interfaces.
        const sinT = Math.sin((75 * Math.PI) / 180) / PANE.glass;
        const dg: V3 = [sinT, 0, Math.sqrt(1 - sinT * sinT)];
        let backs = 0;
        let exits = 0;
        let worst = 0;
        const n = 40;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const x = (((i + 0.5) / n) * 2 - 1) * PANE.base;
                const y = (((j + 0.5) / n) * 2 - 1) * PANE.base;
                if (x * x + y * y >= 0.9 * PANE.base * PANE.base) continue;
                const exact = wetExit(PANE, x, y, dg);
                if (exact?.kind !== 'back') continue;
                backs++;
                // Act: a saída exata pela face de baixo e a do shader na parede fina, que devolve o raio da água direto
                // ao ar (`refract(r, n, água / ar)`, a normal +z) — r, a volta na água (a mesma componente tangencial).
                const exit = wetBackExit(PANE, exact.dir);
                const r = refractW(exact.dir, [0, 0, 1], PANE.glass / PANE.water)!;
                const shader = refractW(norm(r), [0, 0, 1], PANE.water);
                // Assert: as duas existem ou faltam juntas; existindo, descem (o lado da câmera) na mesma direção.
                expect(shader === null).toBe(exit === null);
                if (exit === null || shader === null) continue;
                exits++;
                expect(exit[2]).toBeLessThan(0);
                worst = Math.max(
                    worst,
                    Math.acos(Math.min(Math.max(dot(exit, norm(shader)), -1), 1)),
                );
            }
        }
        expect(backs).toBeGreaterThan(300);
        expect(exits).toBeGreaterThan(20);
        expect(worst).toBeLessThan(1e-6);
    });
});
