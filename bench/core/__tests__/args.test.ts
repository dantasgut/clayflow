import { describe, expect, it } from 'vitest';
import { ArgsError, DEFAULTS, parseArgs, parseCommand, QUICK } from '../args';

describe('parseArgs', () => {
    it('defaults do protocolo (R5)', () => {
        const c = parseArgs([]);
        expect(c).toMatchObject({
            warmupMs: DEFAULTS.warmupMs,
            windowMs: DEFAULTS.windowMs,
            repetitions: 3,
            timeoutMs: 60_000,
            tolerance: 0.1,
            port: 5180,
            engines: ['clayflow', 'three'],
            scenes: [],
            variants: [],
            quick: false,
            headless: false,
            profiling: true,
        });
        expect(c.resolution).toEqual({ width: 1280, height: 720 });
    });

    it('--quick aplica o preset e flags explícitas têm precedência', () => {
        expect(parseArgs(['--quick'])).toMatchObject({ ...QUICK, quick: true });
        expect(parseArgs(['--quick', '--reps', '2']).repetitions).toBe(2);
    });

    it('filtros por lista, forma com =, headless e from', () => {
        const c = parseArgs([
            '--scene',
            'instances,rigid-bodies',
            '--variant=10k',
            '--engine',
            'clayflow',
            '--headless',
            '--from',
            'bench/results/latest.json',
            '--no-profiling',
        ]);
        expect(c.scenes).toEqual(['instances', 'rigid-bodies']);
        expect(c.variants).toEqual(['10k']);
        expect(c.engines).toEqual(['clayflow']);
        expect(c.headless).toBe(true);
        expect(c.from).toBe('bench/results/latest.json');
        expect(c.profiling).toBe(false);
    });

    it('validações com mensagens claras', () => {
        expect(() => parseArgs(['--reps', '0'])).toThrow(ArgsError);
        expect(() => parseArgs(['--warmup', '1.5'])).toThrow(/inteiro positivo/);
        expect(() => parseArgs(['--tolerance', '1'])).toThrow(/\(0, 1\)/);
        expect(() => parseArgs(['--tolerance', 'x'])).toThrow(ArgsError);
        expect(() => parseArgs(['--engine', 'babylon'])).toThrow(/engine desconhecida/);
        expect(() => parseArgs(['--scene'])).toThrow(/espera um valor/);
        expect(() => parseArgs(['--bogus'])).toThrow(/flag desconhecida/);
        expect(parseArgs(['--tolerance', '0.05']).tolerance).toBe(0.05);
    });
});

describe('parseCommand', () => {
    it('reconhece run, check e baseline', () => {
        expect(parseCommand(['check', '--quick'])).toEqual({ command: 'check', rest: ['--quick'] });
        expect(() => parseCommand(['deploy'])).toThrow(ArgsError);
        expect(() => parseCommand([])).toThrow(ArgsError);
    });
});
