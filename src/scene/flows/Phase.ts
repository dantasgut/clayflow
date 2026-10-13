/**
 * Fase de um Flow no quadro. Ordem fixa: `physics` (integração e colisões) → `transform` (transformações de mundo a
 * partir dos `Transform`) → `shadow` (mapas de profundidade) → `forward` (render principal) → `post`
 * (pós-processamento) → `ui`. Dentro da fase: prioridade decrescente; empate pela ordem de registro.
 */
export type Phase = 'physics' | 'transform' | 'shadow' | 'forward' | 'post' | 'ui';

/** Ordem das fases no quadro. */
export const PHASE_ORDER: readonly Phase[] = Object.freeze([
    'physics',
    'transform',
    'shadow',
    'forward',
    'post',
    'ui',
]);
