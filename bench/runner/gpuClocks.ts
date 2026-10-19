import { execFile } from 'node:child_process';
import type { GpuClocks } from '../core/types';

/**
 * Amostra o clock da GPU NVIDIA (`nvidia-smi`) durante a execução do bench (spec 034, R12): a GPU em clock baixo (P8)
 * infla o tempo medido. Sem `nvidia-smi` (outra GPU, outro sistema), nada é amostrado.
 */
export function sampleGpuClocks(intervalMs = 500): { stop(): GpuClocks | undefined } {
    const graphics: number[] = [];
    const memory: number[] = [];
    const states = new Set<string>();
    let alive = true;
    const tick = (): void => {
        if (!alive) return;
        execFile(
            'nvidia-smi',
            ['--query-gpu=clocks.gr,clocks.mem,pstate', '--format=csv,noheader,nounits'],
            { timeout: 2000 },
            (err, out) => {
                if (err !== null) {
                    alive = false;
                    return;
                }
                const [gr, mem, state] = (out.trim().split('\n')[0] ?? '')
                    .split(',')
                    .map((s) => s.trim());
                if (Number.isFinite(Number(gr))) graphics.push(Number(gr));
                if (Number.isFinite(Number(mem))) memory.push(Number(mem));
                if (state !== undefined && state !== '') states.add(state);
                if (alive) setTimeout(tick, intervalMs);
            },
        );
    };
    tick();
    return {
        stop() {
            alive = false;
            if (graphics.length === 0) return undefined;
            const median = (v: number[]): number =>
                [...v].sort((a, b) => a - b)[v.length >> 1] ?? 0;
            return {
                samples: graphics.length,
                graphicsMHz: {
                    min: Math.min(...graphics),
                    median: median(graphics),
                    max: Math.max(...graphics),
                },
                memoryMHz: median(memory),
                pstates: [...states].sort(),
            };
        },
    };
}
