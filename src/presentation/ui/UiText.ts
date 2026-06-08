import { UiElement } from './UiElement';

/**
 * Elemento de texto. UiTextLayout faz word-wrap dentro de `bounds.width`
 * (se >0) e gera glyph quads usando o atlas da `LoadedFont` setada em UIFlow.
 * Sem font setada via `UIFlow.setFont(...)`, UiText é skipado no flatten.
 */
export class UiText extends UiElement {
    /** String a renderizar. Suporta `\n` para quebras explícitas. */
    text = '';
    /** Cor RGBA (multiplica com alpha do glyph atlas). Default branco. */
    color: readonly [number, number, number, number] = [1, 1, 1, 1];
    /** Tamanho da fonte em pixels (escala em relação ao atlas font size). */
    fontSize = 14;
}
