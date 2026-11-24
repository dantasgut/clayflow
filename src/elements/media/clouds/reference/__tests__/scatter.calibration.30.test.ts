import { describe, it } from 'vitest';
import { calibrateElevation } from './scatterCalibration';

// Calibração do transporte não local (spec 041, T023, R8), sol a 30°: ver `scatterCalibration.ts`.
describe('cache de espalhamento contra o rastreamento delta (sol a 30°)', () => {
    it('as seis vistas ficam no critério', () => {
        calibrateElevation(30);
    }, 900_000);
});
