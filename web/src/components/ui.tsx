import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from '../lib/format';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size,
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm';
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      disabled={rest.disabled || loading}
    >
      {loading ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cx('field', className)}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx('input', className)} />;
}

export function SelectInput({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx('select', className)}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx('textarea', className)} />;
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'accent' | 'green' | 'amber' | 'red' | 'teal';
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusDot({ status, className }: { status?: string; className?: string }) {
  return <span className={cx('status-dot', `status-${status ?? 'pending'}`, className)} />;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2.5">
      <h3 className="section-title" style={{ marginBottom: 0 }}>
        {children}
      </h3>
      {right}
    </div>
  );
}
