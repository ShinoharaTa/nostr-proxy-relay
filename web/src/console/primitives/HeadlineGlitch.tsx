import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  accent?: boolean;
  /** PROFILER ではデフォルト OFF。`'soft'` を渡しても殆ど動かない (装飾過多回避のため意図的に抑制)。 */
  glitch?: boolean | 'soft';
  as?: 'h1' | 'h2' | 'h3' | 'span';
}

export function HeadlineGlitch({
  children,
  accent = false,
  glitch = false,
  as: Tag = 'span',
}: Props) {
  const glitchMode = glitch === 'soft' ? 'soft' : glitch ? 'on' : 'off';
  return (
    <Tag
      className={`crt-glitch ${accent ? 'crt-glitch--accent' : ''}`}
      data-glitch={glitchMode}
      data-text={typeof children === 'string' ? children : undefined}
    >
      {children}
    </Tag>
  );
}
