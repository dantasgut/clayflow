import { describe, expect, it, vi } from 'vitest';
import { Time } from '../time/Time';
import { DefaultEventBus } from '../events/DefaultEventBus';

function runFrames(time: Time, frameDt: number, seconds: number): number {
    const frames = Math.round(seconds / frameDt);
    let steps = 0;
    for (let i = 0; i < frames; i++) {
        time.advance(frameDt);
        steps += time.steps;
    }
    return steps;
}

describe('Time.advance — passo fixo com acumulador', () => {
    it.each([
        ['30 Hz', 1 / 30],
        ['60 Hz', 1 / 60],
        ['144 Hz', 1 / 144],
    ])('5 s a %s → 300 passos de 1/60', (_label, frameDt) => {
        const time = new Time();
        expect(runFrames(time, frameDt, 5)).toBe(300);
        expect(time.stepDt).toBeCloseTo(1 / 60, 12);
        expect(time.accumulator).toBeGreaterThanOrEqual(0);
        expect(time.accumulator).toBeLessThan(1 / 60);
    });

    it('acumulador fica em [0, fixedDt) após cada avanço', () => {
        const time = new Time();
        for (const dt of [0.003, 0.021, 0.0167, 0.05, 0.001, 0.033]) {
            time.advance(dt);
            expect(time.accumulator).toBeGreaterThanOrEqual(0);
            expect(time.accumulator).toBeLessThan(time.fixedDt!);
        }
    });

    it('teto maxStepsPerFrame: quadro de 0,2 s → 4 passos, excedente descartado e evento emitido', () => {
        const events = new DefaultEventBus();
        const dropped = vi.fn();
        events.on('timeDropped', dropped);
        const time = new Time(events);
        time.advance(0.2); // 12 passos devidos, 4 executados
        expect(time.steps).toBe(4);
        expect(time.accumulator).toBeLessThan(1 / 60);
        expect(time.droppedTime).toBeCloseTo(0.2 - 4 / 60 - time.accumulator, 9);
        expect(dropped).toHaveBeenCalledOnce();
        expect(dropped.mock.calls[0]![0].dropped).toBeCloseTo(time.droppedTime, 12);
    });

    it('realDt é limitado a maxFrameDt (quadro de 1 s vale 0,25 s)', () => {
        const time = new Time();
        time.advance(1);
        expect(time.realDt).toBe(0.25);
        expect(time.dt).toBe(0.25);
        expect(time.steps).toBe(4);
    });

    it('scale 0,25 → dt e passos proporcionais', () => {
        const time = new Time();
        time.scale = 0.25;
        expect(runFrames(time, 1 / 60, 4)).toBe(60);
        expect(time.elapsed).toBeCloseTo(1, 9);
        expect(time.dt).toBeCloseTo(0.25 / 60, 12);
    });

    it('scale 0 → nenhum passo e elapsed parado', () => {
        const time = new Time();
        time.advance(1 / 60);
        const before = time.elapsed;
        time.scale = 0;
        time.advance(1 / 60);
        expect(time.steps).toBe(0);
        expect(time.dt).toBe(0);
        expect(time.elapsed).toBe(before);
    });

    it('pausePhysics → 0 passos com dt > 0; resumePhysics restaura sem salto', () => {
        const time = new Time();
        time.pausePhysics();
        expect(runFrames(time, 1 / 60, 1)).toBe(0);
        expect(time.dt).toBeGreaterThan(0);
        expect(time.accumulator).toBe(0);
        time.resumePhysics();
        time.advance(1 / 60);
        expect(time.steps).toBe(1);
    });

    it('pause/resume restauram a escala anterior', () => {
        const time = new Time();
        time.scale = 0.5;
        time.pause();
        expect(time.scale).toBe(0);
        time.resume();
        expect(time.scale).toBe(0.5);
    });

    it('fixedDt undefined → 1 passo de physicsDt (0 se pausado)', () => {
        const time = new Time();
        time.fixedDt = undefined;
        time.advance(0.02);
        expect(time.steps).toBe(1);
        expect(time.stepDt).toBeCloseTo(0.02, 12);
        time.pausePhysics();
        time.advance(0.02);
        expect(time.steps).toBe(0);
    });

    it('frame incrementa a cada avanço', () => {
        const time = new Time();
        time.advance(0.01);
        time.advance(0.01);
        expect(time.frame).toBe(2);
    });

    it('valores inválidos lançam RangeError', () => {
        const time = new Time();
        expect(() => (time.scale = -1)).toThrow(RangeError);
        expect(() => (time.physicsScale = -0.1)).toThrow(RangeError);
        expect(() => (time.fixedDt = 0)).toThrow(RangeError);
        expect(() => (time.fixedDt = -1 / 60)).toThrow(RangeError);
        expect(() => (time.maxStepsPerFrame = 0)).toThrow(RangeError);
        expect(() => (time.maxStepsPerFrame = 1.5)).toThrow(RangeError);
        expect(() => (time.maxFrameDt = 0)).toThrow(RangeError);
        expect(() => {
            time.advance(-0.01);
        }).toThrow(RangeError);
    });

    it('dado de GPU acompanha o quadro (dt, elapsed, stepDt, steps)', () => {
        const time = new Time();
        time.advance(1 / 30);
        expect(time.data).toMatchObject({ steps: 2 });
        expect(time.data['dt']).toBeCloseTo(1 / 30, 9);
        expect(time.data['elapsed']).toBeCloseTo(1 / 30, 9);
        expect(time.data['stepDt']).toBeCloseTo(1 / 60, 9);
    });
});
