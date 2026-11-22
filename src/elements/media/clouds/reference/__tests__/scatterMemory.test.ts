import { describe, expect, it } from 'vitest';
import {
    CLOUD_SCATTER_SUN_MEMORY,
    CLOUD_SCATTER_VIEW_MEMORY,
    CLOUD_SCATTER_WINDOW,
} from '../../schemas';
import {
    SCATTER_FILTER_WEIGHT_SQUARES,
    scatterPathDeviation,
    scatterSensitivity,
} from './scatterMemory';

// As memórias do cache de espalhamento no ângulo do sol e da câmera (spec 041, T074) pela sensibilidade medida da luz
// guardada (f64, `scatterMemory.ts`): a medida reduzida (16 caminhos por sonda da vizinhança, o sol a 4° e 8°) reproduz
// a registrada nas constantes (60 caminhos, 2–8°) e a memória que sai dela — o atraso da média igualado ao ruído da sonda
// filtrada com a janela cheia.

const DEG = Math.PI / 180;

describe('cache de espalhamento: a memória pela sensibilidade medida', () => {
    it('a luz guardada em partes (o sol pela luz que chega à sonda, o céu pela irradiância) muda ~6 × menos com o sol', () => {
        // Arrange / Act
        const s = [4, 8].map((el) => scatterSensitivity('sun', el, 16));
        // Assert: a forma de antes 15–28 %/°; ÷ a transmitância só, 8–19; em partes, 2,5–6.
        for (const v of s) {
            expect(v.parts).toBeLessThan(v.today / 2.5);
            expect(v.parts).toBeLessThan(v.sunOnly);
        }
        // A memória do sol: o ruído da sonda filtrada com a janela cheia ÷ a sensibilidade média.
        const noise =
            scatterPathDeviation(4, 400)
            * Math.sqrt(SCATTER_FILTER_WEIGHT_SQUARES / CLOUD_SCATTER_WINDOW);
        const mean = (s[0]!.parts + s[1]!.parts) / 2;
        const memory = (noise / mean) * DEG;
        expect(noise).toBeGreaterThan(0.035);
        expect(noise).toBeLessThan(0.06);
        expect(memory / CLOUD_SCATTER_SUN_MEMORY).toBeGreaterThan(0.6);
        expect(memory / CLOUD_SCATTER_SUN_MEMORY).toBeLessThan(1.6);
    }, 120_000);

    it('a câmera: a mesma conta dá a memória do ângulo dela', () => {
        // Arrange / Act
        const s = [4, 8].map((el) => scatterSensitivity('view', el, 16));
        const noise =
            scatterPathDeviation(4, 400)
            * Math.sqrt(SCATTER_FILTER_WEIGHT_SQUARES / CLOUD_SCATTER_WINDOW);
        // Assert: 3,7 e 8,2 %/° a 4° e 8° com 60 caminhos (a média de 2–8°, 5,2, fixa a constante).
        const memory = (noise / ((s[0]!.parts + s[1]!.parts) / 2)) * DEG;
        expect(memory / CLOUD_SCATTER_VIEW_MEMORY).toBeGreaterThan(0.6);
        expect(memory / CLOUD_SCATTER_VIEW_MEMORY).toBeLessThan(1.6);
    }, 120_000);
});
