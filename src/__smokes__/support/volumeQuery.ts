// Consulta de raios aos volumes atravessados por raios (spec 033 R11, spec 034 T065e): um estágio que lança raios pelo
// ponto `ray_volume_hit` composto pela C2 com as contribuições da cena (o campo dos fluidos) — a superfície que os
// estágios que traçam raios veem, refinada como eles a veem. Comum aos smokes `fluidField` e `refraction`.
import { Flow, FluidField, rayVolumeHitReady, slot, wgslModule, wgslResource } from 'clayflow';
import type { Application, BoundFlow, Frame, StagingBufferSpec, StorageBufferSpec } from 'clayflow';

type Vec3 = readonly [number, number, number];

/** Raios de consulta: origem (com o lado da origem em w: −1 desconhecido, 0 fora, 1 dentro) e direção, dois por raio. */
export const queryRays = wgslResource({
    name: 'smoke_rays',
    binding: { storage: 'read' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});

/** Acertos: (t, acertou, material no contribuinte, 0) e a normal (xyz, 0) por raio. */
const queryHits = wgslResource({
    name: 'smoke_hits',
    binding: { storage: 'read_write' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});

const volumeQuery = wgslModule({
    name: 'smoke_volume_query',
    requires: [rayVolumeHitReady, queryRays, queryHits],
    source: /* wgsl */ `
@compute @workgroup_size(64)
fn smoke_volume_query_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&smoke_rays) / 2u) { return; }
    let h = ray_volume_hit(smoke_rays[i * 2u].xyz, smoke_rays[i * 2u + 1u].xyz, 10.0, i32(round(smoke_rays[i * 2u].w)));
    smoke_hits[i * 2u] = vec4f(h.t, select(0.0, 1.0, h.hit), f32(h.material), 0.0);
    smoke_hits[i * 2u + 1u] = vec4f(h.normal, 0.0);
}`,
});

/** Estágio de consulta: o ponto `ray_volume_hit` composto pela C2 com a contribuição do campo. */
class VolumeQueryFlow extends Flow<{ readonly field: ReturnType<typeof slot.singleton> }, 'idle'> {
    readonly type = 'smokeVolumeQuery';
    readonly slots = { field: slot.singleton(FluidField.schema) };
    override readonly pipelines = [
        {
            id: 'query',
            role: 'compute' as const,
            shader: volumeQuery,
            entryPoints: ['smoke_volume_query_main'],
        },
    ];
    override readonly bindings: ReadonlyMap<typeof queryRays, StorageBufferSpec>;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions = {
        '*': {
            slotsResolved: 'ignore',
            slotChanged: 'ignore',
            slotLost: 'ignore',
            pipelinesCompiled: 'ignore',
            bindGroupReplaced: 'ignore',
        },
    } as const;
    pending = 0;

    constructor(
        rays: StorageBufferSpec,
        hits: StorageBufferSpec,
        private readonly count: number,
    ) {
        super();
        this.bindings = new Map([
            [queryRays, rays],
            [queryHits, hits],
        ]);
    }

    dispatch(frame: Frame, bound: BoundFlow): void {
        if (this.pending === 0) return;
        const p = bound.pipelines.get('query');
        if (p?.role !== 'compute' || !p.ready) return;
        frame.compute('smokeVolumeQuery', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.workgroups(Math.ceil(this.count / 64));
        });
        this.pending--;
    }
}

/** Copia `spec` para a CPU. */
async function readSpec(
    app: Application,
    spec: StorageBufferSpec,
    tag: string,
): Promise<ArrayBuffer> {
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `smoke_volume_${tag}_${spec.byteSize}`,
        byteSize: spec.byteSize,
    });
    app.core.record('smoke-volume-readback', (frame) => {
        frame.copy(spec, staging, spec.byteSize);
    });
    app.core.submit();
    const out = await app.core.readback(staging);
    app.core.destroy(staging);
    return out;
}

/**
 * Os acertos dos raios `rays` (direções unitárias; `side`, o lado da origem quando ela está na superfície de um volume,
 * padrão −1) nos volumes da cena de `app`, até 10 m: por raio (t, acertou,
 * material no contribuinte, 0, a normal xyz, 0). Os quadros da espera têm duração 0 (a simulação não avança). Sem acerto nenhum depois
 * de `attempts` tentativas (o pipeline recomposto com a contribuição do campo não ficou pronto), devolve os zeros.
 */
export async function queryVolumeHits(
    app: Application,
    rays: readonly { readonly o: Vec3; readonly d: Vec3; readonly side?: -1 | 0 | 1 }[],
    attempts = 40,
): Promise<Float32Array> {
    const count = rays.length;
    const storage = (name: string, bytes: number): StorageBufferSpec =>
        app.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `smoke_volume_${name}`,
            byteSize: bytes,
        });
    const raysBuf = storage('rays', count * 32);
    const hitsBuf = storage('hits', count * 32);
    const data = new Float32Array(count * 8);
    rays.forEach((ray, i) => {
        data.set([...ray.o, ray.side ?? -1, ...ray.d, 0], i * 8);
    });
    app.core.write(raysBuf, data);
    const query = new VolumeQueryFlow(raysBuf, hitsBuf, count);
    const registration = app.flows.register(() => query, {
        type: 'smokeVolumeQuery',
        phase: 'transform',
        priority: -100,
    });
    let hits = new Float32Array(count * 8);
    for (
        let attempt = 0;
        attempt < attempts && !hits.some((v, i) => i % 8 === 1 && v > 0.5);
        attempt++
    ) {
        query.pending = 1;
        app.step(0);
        hits = new Float32Array(await readSpec(app, hitsBuf, 'hits'));
        await new Promise((r) => setTimeout(r, 100));
    }
    app.flows.unregister(registration);
    app.core.destroy(raysBuf);
    app.core.destroy(hitsBuf);
    return hits;
}
