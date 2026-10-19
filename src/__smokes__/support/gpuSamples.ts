// Amostras do tempo de GPU por quadro dos smokes de desempenho (spec 034, R17): `frameComplete` traz a leitura mais
// recente resolvida até ali (com defasagem de 1–3 quadros), que se repete até chegar a próxima — cada quadro de GPU
// (`gpuFrame`) conta uma vez só.
import type { Application, FrameCompleteEvent } from 'clayflow';

/** Coletor das leituras novas: `samples` cresce a cada quadro de GPU novo; `counting` liga e desliga a coleta. */
export function gpuSamples(app: Application): { samples: number[]; counting: boolean } {
    const out = { samples: [] as number[], counting: true };
    let last = -1;
    app.events.on('frameComplete', (e: FrameCompleteEvent) => {
        const ms = e.stats.gpuTimeMs;
        const frame = e.stats.gpuFrame ?? -1;
        if (ms === undefined || frame <= last) return;
        last = frame;
        if (out.counting) out.samples.push(ms);
    });
    return out;
}

/**
 * Avança um quadro no ritmo da GPU: espera haver espaço para mais um quadro em voo (`readyForFrame`). Sem isso, com o
 * navegador sem vsync, a CPU submete centenas de quadros à frente e as leituras de tempo só chegam no fim.
 */
export async function stepPaced(app: Application, dt = 1 / 60): Promise<void> {
    while (!app.readyForFrame()) await new Promise((r) => setTimeout(r, 1));
    app.step(dt);
}
