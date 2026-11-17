import { describe, expect, it, vi } from 'vitest';
import { CloudLayer, cloudPhaseParams } from '../CloudLayer';
import { jdeParams } from '../reference/cloudModel';
import { RENDER_PROFILES } from '../../../render/Renderer';

// A camada de nuvens (spec 041, T014): valores e validação do contrato, os descritores sob demanda, o deslocamento do
// vento reduzido em f64 sem salto e os parâmetros da fase iguais aos da referência.

describe('CloudLayer', () => {
    it('padrões do contrato e as funções anexadas', () => {
        // Act
        const layer = new CloudLayer();
        // Assert
        expect([layer.base, layer.top, layer.coverage, layer.type]).toEqual([1500, 4000, 0.5, 0.5]);
        expect([layer.density, layer.albedo, layer.dropletDiameter]).toEqual([0.04, 0.99, 20]);
        expect(layer.wind).toEqual([5, 0]);
        expect([layer.shapeScale, layer.detailScale]).toEqual([12000, 1800]);
        expect(layer.shapeFunction.composite).toBeDefined();
        expect(layer.coverageFunction).toBeUndefined();
    });

    it('validação: RangeError nomeando o valor', () => {
        expect(() => new CloudLayer({ base: 2000, top: 1000 })).toThrow(/topo/);
        expect(() => new CloudLayer({ coverage: 1.5 })).toThrow(/cobertura/);
        expect(() => new CloudLayer({ type: -0.1 })).toThrow(/tipo/);
        expect(() => new CloudLayer({ albedo: 2 })).toThrow(/albedo/);
        expect(() => new CloudLayer({ dropletDiameter: 4 })).toThrow(/gotículas/);
        expect(() => new CloudLayer({ density: Number.NaN })).toThrow(/densidade/);
        expect(() => new CloudLayer({ wind: [Infinity, 0] })).toThrow(/vento/);
        const layer = new CloudLayer();
        expect(() => {
            layer.top = 100;
        }).toThrow(/topo/);
        expect(layer.top).toBe(4000);
    });

    it('descritores sob demanda; a marcha e a profundidade dela são séries temporais', () => {
        const d = new CloudLayer().getDescriptors();
        const byId = new Map(d.map((x) => [x.id, x]));
        for (const id of ['shape', 'detail', 'coverage', 'shadow', 'panorama', 'march', 'view'])
            expect(byId.get(id)?.allocation).toBe('onDemand');
        expect(byId.get('march')?.history?.depth).toBe(2);
        expect(byId.get('marchDepth')?.history?.depth).toBe(2);
        expect(byId.get('shape')?.textureShape?.width).toBe(128);
        expect(byId.get('detail')?.textureShape?.width).toBe(32);
    });

    it('vento: 24 h simuladas sem salto (a redução módulo o período mantém a posição no volume periódico)', () => {
        // Arrange
        const layer = new CloudLayer({ wind: [10.3, -4.7], shapeScale: 12000, detailScale: 1800 });
        const frac = (v: number, p: number): number => (((v / p) % 1) + 1) % 1;
        let worst = 0;
        // Act: a posição no volume de um ponto fixo a cada segundo por 24 h.
        for (let t = 0; t <= 86_400; t += 1) {
            const a = layer.windOffsets(t);
            const b = layer.windOffsets(t + 1 / 60);
            // O deslocamento entre dois quadros, no espaço periódico do volume.
            const dx = frac(a.shape[0] - b.shape[0], 12000);
            const step = Math.min(dx, 1 - dx) * 12000;
            worst = Math.max(worst, Math.abs(step - 10.3 / 60));
            // Assert: o reduzido coincide com o acumulado módulo o período.
            if (t % 3600 === 0)
                expect(frac(a.shape[0], 12000)).toBeCloseTo(frac(10.3 * t, 12000), 9);
        }
        expect(worst).toBeLessThan(1e-6);
        expect(layer.windOffsets(86_400).coverage[0]).toBeCloseTo(10.3 * 86_400, 6);
    });

    it('parâmetros da fase pelo diâmetro iguais aos da referência', () => {
        for (const d of [5, 12, 20, 35, 50]) {
            const p = cloudPhaseParams(d);
            const r = jdeParams(d);
            expect(p).toEqual([r.gHG, r.gD, r.alpha, r.wD]);
        }
    });

    it('qualidade do perfil: tamanhos novos realocam (redescreve), os outros só mudam o dado', () => {
        const layer = new CloudLayer();
        const redescribe = vi.spyOn(layer as unknown as { redescribe: () => void }, 'redescribe');
        layer.fromRenderer(RENDER_PROFILES.high.clouds);
        expect(redescribe).not.toHaveBeenCalled();
        layer.fromRenderer(RENDER_PROFILES.medium.clouds);
        expect(redescribe).toHaveBeenCalledTimes(1);
        expect(layer.quality.steps).toBe(64);
    });
});
