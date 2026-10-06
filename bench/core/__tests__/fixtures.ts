import { parseArgs } from '../args';
import type { Metrics, Result, RunConfig, RunFile, SceneDefinition } from '../types';

const noop = () => Promise.resolve({ setup: () => undefined });

/** Catálogo sintético: uma cena suportada nas duas engines e uma só no Three. */
export const syntheticCatalog: readonly SceneDefinition[] = [
    {
        id: 'boxes',
        title: 'Caixas',
        description: 'caixas',
        phase: 'F0',
        seed: 1,
        camera: { position: [0, 0, 5], target: [0, 0, 0], fovDeg: 60 },
        variants: [
            { id: '10', params: { count: 10 } },
            { id: '20', params: { count: 20 } },
        ],
        implementations: { clayflow: noop, three: noop },
    },
    {
        id: 'lights',
        title: 'Luzes',
        description: 'luzes',
        phase: 'F0',
        seed: 2,
        camera: { position: [0, 0, 5], target: [0, 0, 0], fovDeg: 60 },
        variants: [{ id: '8', params: { count: 8 } }],
        implementations: {
            clayflow: { unsupported: 'sem luzes pontuais', until: 'F4' },
            three: noop,
        },
    },
];

export function config(argv: string[] = []): RunConfig {
    return parseArgs(argv);
}

export function metrics(over: Partial<Metrics> = {}): Metrics {
    return {
        cpuMs: 4,
        gpuMs: 2,
        frameMs: { mean: 8, p95: 10, p99: 12 },
        fps: 125,
        drawCalls: 100,
        memoryBytes: 10 * 1024 * 1024,
        memoryKind: 'exact',
        samples: { frames: 1000, gpu: 300 },
        vsyncLimited: false,
        ...over,
    };
}

export function okResult(
    scene: string,
    variant: string,
    engine: 'clayflow' | 'three',
    over: Partial<Metrics> = {},
): Result {
    return { scene, variant, engine, status: 'ok', metrics: metrics(over) };
}

export function runFile(results: readonly Result[]): RunFile {
    return {
        schemaVersion: 1,
        profile: {
            profileId: 'apple-m2-chrome141-macos-1280x720-abc123',
            gpu: { vendor: 'apple', architecture: 'metal-3', device: 'Apple M2', description: '' },
            browser: { name: 'chrome', version: '141.0.1', major: 141 },
            os: 'macos',
            resolution: { width: 1280, height: 720 },
            devicePixelRatio: 1,
            timestampQuery: true,
            versions: { clayflow: '0.1.0', three: '0.186.1', rapier: '0.21.0' },
            commit: 'abc1234',
            date: '2026-10-05',
        },
        config: config(),
        startedAt: '2026-10-05T10:00:00.000Z',
        durationMs: 60_000,
        results,
    };
}
