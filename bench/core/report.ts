import type {
    EngineId,
    EnvironmentProfile,
    Metrics,
    RegressionItem,
    RegressionReport,
    Result,
    RunConfig,
    RunFile,
} from './types';

/** Monta o arquivo de execução (`bench/results/*.json`). */
export function toRunFile(
    profile: EnvironmentProfile,
    config: RunConfig,
    startedAt: Date,
    durationMs: number,
    results: readonly Result[],
): RunFile {
    return {
        schemaVersion: 1,
        profile,
        config,
        startedAt: startedAt.toISOString(),
        durationMs,
        results: [...results],
    };
}

const STATUS_LABEL: Record<Exclude<Result['status'], 'ok'>, string> = {
    unsupported: 'não suportado',
    failed: 'falhou',
    timeout: 'tempo esgotado',
};

function fmt(n: number, digits = 2): string {
    if (!Number.isFinite(n)) return 'n/d';
    return n.toFixed(digits);
}

/** FPS: inteiro, com uma casa abaixo de 10 (cenas muito lentas não viram "0"). */
const fpsOf = (m: Metrics): number => m.fps;
function fpsCell(r: Result | undefined): string {
    const v = r?.metrics?.fps;
    return value(r, fpsOf, v !== undefined && v < 10 ? 1 : 0);
}

function statusCell(r: Result | undefined): string | undefined {
    if (r === undefined) return '—';
    if (r.status === 'ok') return undefined;
    const label = STATUS_LABEL[r.status];
    return r.status === 'unsupported' && r.until !== undefined
        ? `${label} (até ${r.until})`
        : label;
}

function value(r: Result | undefined, pick: (m: Metrics) => number | null, digits = 2): string {
    const s = statusCell(r);
    if (s !== undefined) return s;
    const v = r?.metrics !== undefined ? pick(r.metrics) : null;
    if (v === null) return 'n/d';
    return `${fmt(v, digits)}${r?.unstable === true ? ' ⚠' : ''}`;
}

/** Razão clayflow ÷ Three (> 1 = clayflow mais lento); '—' sem os dois números. */
function ratio(
    clay: Result | undefined,
    three: Result | undefined,
    pick: (m: Metrics) => number | null,
): string {
    const a = clay?.metrics !== undefined ? pick(clay.metrics) : null;
    const b = three?.metrics !== undefined ? pick(three.metrics) : null;
    if (a === null || b === null || b === 0) return '—';
    return `${fmt(a / b, 2)}×`;
}

interface Row {
    scene: string;
    variant: string;
    byEngine: Partial<Record<EngineId, Result>>;
}

function rows(results: readonly Result[]): Row[] {
    const map = new Map<string, Row>();
    for (const r of results) {
        const key = `${r.scene}\u0000${r.variant}`;
        const row = map.get(key) ?? { scene: r.scene, variant: r.variant, byEngine: {} };
        row.byEngine[r.engine] = r;
        map.set(key, row);
    }
    return [...map.values()];
}

/**
 * Custo efetivo por quadro: o maior entre intervalo médio de quadro, CPU e GPU. Sem vsync o laço
 * pode submeter mais rápido do que a GPU termina — o intervalo sozinho subestimaria o custo.
 */
export function effectiveFrameMs(m: Metrics): number {
    return Math.max(m.frameMs.mean, m.cpuMs, m.gpuMs ?? 0);
}

/** Veredito por linha a partir do custo efetivo por quadro (±10% = equivalente). */
export function verdict(clay: Result | undefined, three: Result | undefined): string {
    if (clay?.status !== 'ok' || three?.status !== 'ok') {
        const s = statusCell(clay?.status === 'ok' ? three : clay);
        return `sem comparação (${s ?? '—'})`;
    }
    const a = clay.metrics !== undefined ? effectiveFrameMs(clay.metrics) : undefined;
    const b = three.metrics !== undefined ? effectiveFrameMs(three.metrics) : undefined;
    if (a === undefined || b === undefined || a <= 0 || b <= 0) return 'sem comparação';
    const r = a / b;
    if (r < 0.9) return `clayflow mais rápido (${fmt(1 / r)}×)`;
    if (r > 1.1) return `clayflow mais lento (${fmt(r)}×)`;
    return 'equivalente (±10%)';
}

/** Tabela markdown lado a lado (`latest.md`) no formato de `contracts/results-schema.md`. */
export function toMarkdown(run: RunFile): string {
    const p = run.profile;
    const lines: string[] = [];
    lines.push('# Benchmark clayflow × Three.js', '');
    lines.push(
        `- **GPU**: ${[p.gpu.vendor, p.gpu.device || p.gpu.architecture, p.gpu.description].filter(Boolean).join(' · ')}`,
        `- **Navegador**: ${p.browser.name} ${p.browser.version} · **SO**: ${p.os} · **Resolução**: ${p.resolution.width}×${p.resolution.height} (DPR ${p.devicePixelRatio})`,
        `- **Timestamps de GPU**: ${p.timestampQuery ? 'sim' : 'não'} · **Versões**: clayflow ${p.versions.clayflow}, three ${p.versions.three}, rapier ${p.versions.rapier}`,
        `- **Commit**: ${p.commit} · **Data**: ${p.date} · **Perfil**: \`${p.profileId}\``,
        `- **Protocolo**: aquecimento ${run.config.warmupMs} ms, janela ${run.config.windowMs} ms, ${run.config.repetitions} repetição(ões)${run.config.quick ? ' (modo rápido)' : ''}`,
        '',
    );
    lines.push(
        '| Cena | Variante | CPU ms (clay / three / ×) | GPU ms (clay / three / ×) | FPS (clay / three) | p99 ms (clay / three) | Draw calls (clay / three) | Memória MB (clay / three\\*) |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    const notes: string[] = [];
    const all = rows(run.results);
    for (const row of all) {
        const c = row.byEngine.clayflow;
        const t = row.byEngine.three;
        const mb = (m: Metrics): number => m.memoryBytes / (1024 * 1024);
        const threeMem =
            t?.metrics?.memoryKind === 'estimated' ? `${value(t, mb, 1)}\\*` : value(t, mb, 1);
        lines.push(
            `| ${row.scene} | ${row.variant} | ${value(c, (m) => m.cpuMs)} / ${value(t, (m) => m.cpuMs)} / ${ratio(c, t, (m) => m.cpuMs)} | ${value(c, (m) => m.gpuMs)} / ${value(t, (m) => m.gpuMs)} / ${ratio(c, t, (m) => m.gpuMs)} | ${fpsCell(c)} / ${fpsCell(t)} | ${value(c, (m) => m.frameMs.p99)} / ${value(t, (m) => m.frameMs.p99)} | ${value(c, (m) => m.drawCalls, 0)} / ${value(t, (m) => m.drawCalls, 0)} | ${value(c, mb, 1)} / ${threeMem} |`,
        );
        for (const r of [c, t]) {
            if (r?.metrics?.vsyncLimited === true) {
                notes.push(
                    `- ${row.scene}/${row.variant} (${r.engine}): limitado pela vsync — compare CPU/GPU por quadro.`,
                );
            }
            if (
                r !== undefined
                && (r.status === 'failed' || r.status === 'timeout')
                && r.reason !== undefined
            ) {
                notes.push(
                    `- ${row.scene}/${row.variant} (${r.engine}): ${STATUS_LABEL[r.status]} — ${r.reason}`,
                );
            }
            if (r?.status === 'unsupported' && r.reason !== undefined) {
                notes.push(
                    `- ${row.scene}/${row.variant} (${r.engine}): não suportado — ${r.reason}${r.until !== undefined ? ` (até ${r.until})` : ''}`,
                );
            }
        }
    }
    lines.push(
        '',
        '`×` = clayflow ÷ Three (> 1 = clayflow mais lento). `n/d` = indisponível. `*` = memória estimada. ⚠ = instável (CV > 5% entre repetições).',
        'O resumo compara o custo efetivo por quadro: o maior entre intervalo médio de quadro, CPU e GPU.',
        '',
        '## Resumo',
        '',
    );
    for (const row of all) {
        lines.push(
            `- **${row.scene} / ${row.variant}**: ${verdict(row.byEngine.clayflow, row.byEngine.three)}`,
        );
    }
    if (notes.length > 0) lines.push('', '## Observações', '', ...notes);
    const limitations = run.results.filter(
        (r) => r.limitations !== undefined && r.limitations.length > 0,
    );
    if (limitations.length > 0) {
        lines.push('', '## Limitações conhecidas do motor', '');
        const seen = new Set<string>();
        for (const r of limitations) {
            const key = `${r.scene}/${r.variant}/${r.engine}`;
            if (seen.has(key)) continue;
            seen.add(key);
            lines.push(
                `- **${r.scene} / ${r.variant}** (${r.engine}): ${(r.limitations ?? []).join('; ')}`,
            );
        }
    }
    return `${lines.join('\n')}\n`;
}

function item(i: RegressionItem): string {
    const fmtV = (v: number | string): string => (typeof v === 'number' ? fmt(v) : v);
    const delta = i.deltaPct === null ? '—' : `${i.deltaPct > 0 ? '+' : ''}${fmt(i.deltaPct, 1)}%`;
    return `| ${i.scene} | ${i.variant} | ${i.metric} | ${fmtV(i.baseline)} | ${fmtV(i.current)} | ${delta} |`;
}

/** Relatório do gate (`bench:check`): regressões, melhorias e itens ignorados. */
export function regressionToMarkdown(report: RegressionReport): string {
    const head =
        '| Cena | Variante | Métrica | Baseline | Atual | Δ |\n| --- | --- | --- | --- | --- | --- |';
    const lines: string[] = [
        `# Gate de performance — ${report.passed ? 'PASSOU' : 'REPROVADO'}`,
        '',
        `Perfil \`${report.profileId}\` · baseline do commit ${report.baselineCommit} · tolerância ${fmt(report.tolerance * 100, 0)}%`,
        '',
    ];
    if (report.regressions.length > 0) {
        lines.push('## Regressões', '', head, ...report.regressions.map(item), '');
    } else {
        lines.push('Nenhuma regressão acima da tolerância.', '');
    }
    if (report.improvements.length > 0) {
        lines.push('## Melhorias', '', head, ...report.improvements.map(item), '');
        lines.push(
            'Há melhorias acima da tolerância — considere atualizar o baseline: `npm run bench:baseline`.',
            '',
        );
    }
    if (report.skipped.length > 0) {
        lines.push('## Ignorados', '');
        for (const s of report.skipped) {
            lines.push(`- ${s.scene}/${s.variant} ${s.metric}: ${s.note ?? 'sem comparação'}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
