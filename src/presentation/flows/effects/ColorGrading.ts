import { PostProcessEffect } from '../../resources/PostProcessEffect';
import type { PostProcessOptions } from '../../resources/PostProcessEffect';

/** Opções de domínio do color grading (lift/gain/gamma), além de `enabled` e `strength` (mistura com o original). */
export interface ColorGradingOptions extends Omit<PostProcessOptions, 'aux'> {
    /** Deslocamento subtraído da cor antes do ganho (default 0). */
    readonly lift?: number;
    /** Ganho multiplicativo depois do lift (default 1). */
    readonly gain?: number;
    /** Gama aplicado ao resultado (default 1; > 1 clareia os meios-tons). */
    readonly gamma?: number;
}

/**
 * ColorGrading — `graded = clamp((c − lift) × gain)^(1/gamma)`, misturado ao original por `strength`. Com os padrões
 * (lift 0, gain 1, gamma 1) o efeito é a identidade.
 */
export class ColorGrading extends PostProcessEffect {
    constructor(options: ColorGradingOptions = {}) {
        super({
            ...(options.enabled !== undefined ? { enabled: options.enabled } : {}),
            ...(options.strength !== undefined ? { strength: options.strength } : {}),
            aux: [options.lift ?? 0, options.gain ?? 1, options.gamma ?? 1],
        });
    }

    get name(): string {
        return 'ColorGrading';
    }
    get fragmentEntry(): string {
        return 'fs_color_grading';
    }
}
