import { PostProcessEffect } from '../../resources/PostProcessEffect';

export class Vignette extends PostProcessEffect {
    get name(): string { return 'Vignette'; }
    get fragmentEntry(): string { return 'fs_vignette'; }
}
