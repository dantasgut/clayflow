// Spec 039 — O custo dos despachos (R13, T002): quanto custa, no relógio de parede, gravar e executar N despachos de
// compute num passe — indiretos com 0 grupos (a rodada vazia da onda dos acertos), indiretos com 1 grupo e diretos com
// 1 grupo e diretos com 4096 grupos que saem logo (o despacho do tamanho da capacidade) — para dimensionar as rodadas da onda. Kernels triviais, sem laço. Mede a mediana de 15 repetições de cada N
// (o quadro esvaziado na GPU antes do relógio parar) e a inclinação por despacho.
// Para rodar: `npm run smoke -- dispatchCost`. Resultado: `DISPATCHCOST SMOKE PASSED` (só mede) ou `FAIL: …`.
import { Application, createScene } from 'clayflow/web';
import type { IndirectBufferSpec, StagingBufferSpec, StorageBufferSpec } from 'clayflow/web';
import { createComputeKernel, destroyComputeKernel } from '../scene/flows/createComputeKernel';
import { wgslModule } from '../scene/shaders/WgslModule';
import { wgslResource } from '../scene/shaders/WgslResource';

function log(msg: string): void {
    console.log(`[dispatchCost] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];

const counter = wgslResource({
    name: 'dispatch_cost_counter',
    binding: { storage: 'read_write' },
    type: { wgsl: 'u32', array: true },
    frequency: 'stage',
    provider: 'private',
});

const kernel = wgslModule({
    name: 'dispatch_cost',
    requires: [counter],
    source: `@compute @workgroup_size(64)
fn dispatch_cost_main(@builtin(global_invocation_id) gid: vec3u) {
    if (gid.x == 0u) { dispatch_cost_counter[0] = dispatch_cost_counter[0] + 1u; }
}`,
});

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function main(): Promise<void> {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    document.body.appendChild(canvas);
    const app = await Application.create({ canvas, scene: createScene(), autoResize: false });
    const core = app.core;
    const buffer = core.create<StorageBufferSpec>({
        kind: 'buffer',
        subkind: 'storage',
        discriminator: 'dispatch_cost_counter',
        byteSize: 16,
    });
    const args = (name: string, groups: number): IndirectBufferSpec => {
        const b = core.create<IndirectBufferSpec>({
            kind: 'buffer',
            subkind: 'indirect',
            discriminator: `dispatch_cost_${name}`,
            byteSize: 16,
        });
        core.write(b, new Uint32Array([groups, groups > 0 ? 1 : 0, groups > 0 ? 1 : 0, 0]));
        return b;
    };
    const empty = args('empty', 0);
    const one = args('one', 1);
    const k = createComputeKernel(core, {
        discriminator: 'dispatch_cost',
        shader: kernel,
        entryPoint: 'dispatch_cost_main',
        bindings: new Map([[counter, buffer]]),
    });
    const staging = core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: 'dispatch_cost_staging',
        byteSize: 16,
    });
    /** Tempo de parede de gravar, submeter e esperar `n` despachos do modo dado. */
    const batch = async (n: number, mode: 'empty' | 'one' | 'direct' | 'wide'): Promise<number> => {
        const t0 = performance.now();
        core.record('dispatch-cost', (frame) => {
            frame.compute('dispatch-cost', (pass) => {
                pass.bind.setPipeline(k.pipeline);
                k.bindTo(pass.bind);
                for (let i = 0; i < n; i++) {
                    if (mode === 'direct') pass.dispatch.workgroups(1);
                    else if (mode === 'wide') pass.dispatch.workgroups(4096);
                    else pass.dispatch.workgroupsIndirect(mode === 'empty' ? empty : one, 0);
                }
            });
            frame.copy(buffer, staging, 16);
        });
        core.submit();
        await core.readback(staging);
        return performance.now() - t0;
    };
    for (let i = 0; i < 5; i++) await batch(100, 'one');
    const counts = [0, 500, 2000];
    for (const mode of ['empty', 'one', 'direct', 'wide'] as const) {
        const times = new Map<number, number>();
        for (const n of counts) {
            const samples: number[] = [];
            for (let r = 0; r < 15; r++) samples.push(await batch(n, mode));
            times.set(n, median(samples));
        }
        const slope = (times.get(2000)! - times.get(0)!) / 2000;
        log(
            `${mode}: ${counts.map((n) => `${n} → ${times.get(n)!.toFixed(3)} ms`).join(', ')}; por despacho ${(slope * 1000).toFixed(2)} µs`,
        );
    }
    destroyComputeKernel(core, k);
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('DISPATCHCOST SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
