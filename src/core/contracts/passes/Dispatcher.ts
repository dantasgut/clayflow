import type { IndirectBufferSpec } from '../specs/IndirectBufferSpec';

/** Despacho de compute dentro de um passe. */
export interface Dispatcher {
    /**
     * Despacha grupos suficientes para `count` invocações com grupos de `workgroupSize`, distribuídos em x/y dentro
     * de `maxComputeWorkgroupsPerDimension` do device: `g = ⌈count / workgroupSize⌉`, `x = min(g, máx)`,
     * `y = ⌈g / x⌉`. O shader indexa por `gid.x + gid.y * num_workgroups.x * workgroupSize` e descarta
     * `i >= count`. `count = 0` não despacha.
     */
    invocations(count: number, workgroupSize: number): this;
    /**
     * Despacha `x × y × z` grupos. Lança `RangeError` (nomeando `maxComputeWorkgroupsPerDimension`) se alguma
     * dimensão exceder o limite do device — em vez de um erro de validação silencioso no console.
     */
    workgroups(x: number, y?: number, z?: number): this;
    /** Despacho com contagens lidas de um buffer indireto (`x, y, z` em u32 a partir de `offset`). */
    workgroupsIndirect(spec: IndirectBufferSpec, offset?: number): this;
}
