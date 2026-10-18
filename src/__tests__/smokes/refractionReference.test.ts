import { describe, expect, it } from 'vitest';
import {
    channelIor,
    edgeSteps,
    fresnel,
    traceChannel,
    type RefractionScene,
} from '../../__smokes__/support/refractionReference';

const panel = { z: -3, cell: 0.25, half: 6, bright: 4, dark: 0.25 };

describe('referência analítica da refração (spec 034)', () => {
    it('Fresnel: 4 % a 1,5 na normal, reflexão interna total além do ângulo crítico', () => {
        expect(fresnel(1, 1.5, 1)).toBeCloseTo(0.04, 4);
        expect(fresnel(1.5, 1, Math.cos(Math.asin(1 / 1.5) + 0.01))).toBe(1);
    });

    it('dispersão: IOR por canal pelo Abbe (vermelho menor, azul maior)', () => {
        const m = { ior: 1.5, abbe: 20 };
        expect(channelIor(m, 0)).toBeCloseTo(1.4875, 6);
        expect(channelIor(m, 2)).toBeCloseTo(1.5125, 6);
        expect(channelIor({ ior: 1.5 }, 0)).toBe(1.5);
    });

    it('bloco na normal: o painel atrás atenuado pelas duas interfaces e por Beer-Lambert', () => {
        const scene: RefractionScene = {
            panel,
            objects: [
                {
                    shape: { kind: 'box', min: [-1, -1, -0.5], max: [1, 1, 0.5] },
                    medium: { ior: 1.5, color: [0.5, 1, 1], depth: 1 },
                },
            ],
        };
        // x = y = 0.1: casa clara (0 + 0 par).
        const t = 1 - fresnel(1, 1.5, 1);
        const r = 1 - t;
        // Série das reflexões internas: t² a / (1 − r² a²), a = absorção de uma travessia.
        const red = traceChannel(scene, [0.1, 0.1, 2], [0, 0, -1], 0);
        const a = 0.5;
        expect(red).toBeCloseTo((4 * t * t * a) / (1 - r * r * a * a), 3);
        const green = traceChannel(scene, [0.1, 0.1, 2], [0, 0, -1], 1);
        expect(green).toBeCloseTo((4 * t * t) / (1 - r * r), 3);
    });

    it('esfera como lente: um raio acima do centro acerta o painel abaixo (imagem invertida)', () => {
        const scene: RefractionScene = {
            panel: { ...panel, cell: 100 },
            objects: [
                { shape: { kind: 'sphere', center: [0, 0, 0], radius: 0.5 }, medium: { ior: 1.5 } },
            ],
        };
        // Casas de 100 m: no plano x = 0 (o raio não sai dele), y ≥ 0 é a casa clara (0, 0) e y < 0 a escura.
        const lit = (y: number): number => traceChannel(scene, [0, y, 2], [0, 0, -1], 1);
        expect(lit(-0.2)).toBeGreaterThan(lit(0.2));
    });

    it('reflexão interna total: dentro do vidro além do ângulo crítico nada sai pela face', () => {
        const scene: RefractionScene = {
            panel,
            objects: [
                { shape: { kind: 'box', min: [-1, -1, -1], max: [1, 1, 1] }, medium: { ior: 1.5 } },
            ],
        };
        const s = Math.SQRT1_2;
        const v = traceChannel(scene, [0, 0, 0], [s, 0, -s], 1, [0]);
        expect(Number.isFinite(v)).toBe(true);
    });
});

describe('degraus ao longo das bordas (spec 034, SC-001)', () => {
    const W = 64;
    const image = (f: (x: number, y: number) => number): Float32Array => {
        const l = new Float32Array(W * W);
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) l[y * W + x] = f(x, y);
        return l;
    };
    it('borda diagonal lisa: quase nada ao longo dela; em degraus de 8 px: o contraste salta', () => {
        // Borda a 30°, com cobertura parcial nos pixels cortados (lisa).
        const smooth = image((x, y) => Math.min(Math.max(y - 0.577 * x - 10 + 0.5, 0), 1));
        // A mesma borda amostrada em blocos de 8 px (a cópia ampliada 8×).
        const blocky = image((x, y) => {
            const bx = Math.floor(x / 8) * 8 + 4;
            const by = Math.floor(y / 8) * 8 + 4;
            return by - 0.577 * bx - 10 > 0 ? 1 : 0;
        });
        const s = edgeSteps(smooth, W, W, 1);
        const b = edgeSteps(blocky, W, W, 1);
        expect(s.count).toBeGreaterThan(20);
        expect(s.p99).toBeLessThan(0.7);
        expect(b.p99).toBeGreaterThan(s.p99 * 1.2);
    });
});
