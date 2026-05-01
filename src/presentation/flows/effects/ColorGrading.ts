import { PostProcessEffect } from '../../resources/PostProcessEffect';

export class ColorGrading extends PostProcessEffect {
    get name(): string {
        return 'ColorGrading';
    }
    get fragmentEntry(): string {
        return 'fs_color_grading';
    }
}
