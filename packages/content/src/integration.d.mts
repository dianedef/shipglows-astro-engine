import type { AstroIntegration } from 'astro';
import type { ContentModel } from './model.mjs';
export function shipglowsContent(options?: { loadModel?: () => ContentModel }): AstroIntegration;
