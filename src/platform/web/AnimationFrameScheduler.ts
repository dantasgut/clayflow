import type { FrameScheduler } from '../../presentation/app/FrameScheduler';

/** O agendador do laço no navegador (spec 038): o `requestAnimationFrame`. */
export const animationFrameScheduler: FrameScheduler = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => {
        cancelAnimationFrame(handle as number);
    },
};
