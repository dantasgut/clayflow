// Spec 037 — Smoke dos limites do adaptador (T043, US7; FR-014, SC-008).
//
// Lê todos os limites do adaptador (`adapter.limits`, os nomes do WebGPU) e as `features`, e grava na fixture do perfil
// (`adapter-limits-<fornecedor>-<arquitetura>.json`, com a data e o navegador): a base de `ENGINE_PORTABLE_LIMITS`, o
// mínimo comum dos perfis de referência (Apple M4 `apple-metal-3`; RTX 4090 `nvidia-lovelace`, rodado na outra
// máquina). Falha se o adaptador não cobre os limites portáteis do motor (o motor pediria mais do que ele tem).
//
// Para rodar: `npm run smoke -- adapterLimits`. Resultado: `ADAPTERLIMITS SMOKE PASSED` ou `FAIL: …`.
import { ENGINE_PORTABLE_LIMITS, WEBGPU_LIMIT_NAMES } from '../core/gpu/GpuContext';
import { writeJsonFixture } from './support/fixtures';

function log(msg: string): void {
    console.log(`[adapterLimits] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

/** O perfil do adaptador, como o das outras fixtures (`gpuProfile`). */
function profileOf(info: Partial<GPUAdapterInfo> | undefined): string {
    const slug = `${info?.vendor ?? ''}-${info?.architecture ?? ''}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
    return slug.replace(/^-+|-+$/g, '') || 'unknown';
}

async function main(): Promise<void> {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (adapter === null) throw new Error('sem adaptador WebGPU');
    const info = (adapter as { info?: Partial<GPUAdapterInfo> }).info;
    const limits: Record<string, number> = {};
    for (const name of WEBGPU_LIMIT_NAMES) {
        const v = (adapter.limits as unknown as Record<string, unknown>)[name];
        if (typeof v === 'number') limits[name] = v;
    }
    const profile = profileOf(info);
    const record = {
        profile,
        date: new Date().toISOString().slice(0, 10),
        browser: navigator.userAgent,
        adapter: {
            vendor: info?.vendor ?? '',
            architecture: info?.architecture ?? '',
            device: info?.device ?? '',
            description: info?.description ?? '',
        },
        limits,
        features: [...adapter.features].sort(),
    };
    await writeJsonFixture(`adapter-limits-${profile}.json`, record);
    log(
        `perfil ${profile}: ${Object.keys(limits).length} limites, ${record.features.length} features`,
    );
    for (const name of Object.keys(ENGINE_PORTABLE_LIMITS))
        log(`  ${name}: adaptador ${limits[name]}, portátil ${ENGINE_PORTABLE_LIMITS[name]}`);
    const short = Object.entries(ENGINE_PORTABLE_LIMITS).filter(
        ([name, value]) => (limits[name] ?? 0) < value,
    );
    if (short.length > 0) {
        log(
            `FAIL: o adaptador fica abaixo dos limites portáteis: ${short
                .map(([n, v]) => `${n} ${limits[n]} < ${v}`)
                .join(', ')}`,
        );
        return;
    }
    log('ADAPTERLIMITS SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
