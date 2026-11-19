import type { StylePackSummary } from '../types';
import { Badge } from './ui';
import { cx } from '../lib/format';

interface StylePickerProps {
  styles: StylePackSummary[];
  value: string;
  onChange: (id: string) => void;
}

const SWATCH_KEYS: Array<keyof StylePackSummary['palette']> = [
  'background',
  'primary',
  'secondary',
  'accent',
  'text',
];

export function StylePicker({ styles, value, onChange }: StylePickerProps) {
  return (
    <div className="style-grid">
      {styles.map((style) => (
        <button
          key={style.id}
          type="button"
          className={cx('style-card', value === style.id && 'is-selected')}
          onClick={() => onChange(style.id)}
          aria-pressed={value === style.id}
        >
          {style.previewUrl ? (
            <img className="style-thumb" src={style.previewUrl} alt={`${style.name} preview`} loading="lazy" />
          ) : (
            <div className="style-thumb" />
          )}
          <div className="style-name">
            <span className="truncate">{style.name}</span>
            {style.stageReady ? (
              <Badge tone="green">Ready</Badge>
            ) : (
              <Badge tone="neutral">Stub</Badge>
            )}
          </div>
          <div className="style-desc">{style.description}</div>
          <div className="swatches">
            {SWATCH_KEYS.map((key) => (
              <span
                key={key}
                className="swatch"
                style={{ background: style.palette[key] }}
                title={`${key}: ${style.palette[key]}`}
              />
            ))}
            <span
              className="ml-auto text-[9.5px] mono"
              style={{ color: style.contrast.ok ? 'var(--green)' : 'var(--red)' }}
              title="Palette contrast check"
            >
              {style.contrast.ok ? 'AA' : 'LOW'}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
