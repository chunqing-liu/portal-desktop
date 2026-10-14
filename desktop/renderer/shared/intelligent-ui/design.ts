/** Shared design vocabulary: validation, renderer and agent use the same tokens. */
export const designTokens = {
  density: ['compact', 'normal', 'relaxed'],
  surface: ['plain', 'soft', 'outline', 'accent'],
  emphasis: ['normal', 'muted', 'strong'],
  align: ['start', 'center', 'end', 'stretch'],
  gap: ['none', 'small', 'medium', 'large'],
  ratio: ['equal', 'wide-left', 'wide-right'],
  size: ['small', 'normal', 'large'],
} as const;
export type Appearance = { [K in keyof typeof designTokens]?: typeof designTokens[K][number] } & { span?: 1 | 2 | 3 };
export const appearanceDescription = Object.entries(designTokens).map(([key, values]) => `${key}:${values.join('/')}`).join('；') + '；span:1/2/3（仅grid直接子节点跨列）';
