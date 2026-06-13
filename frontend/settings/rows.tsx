import React, { useState, useEffect } from 'react';

interface ToggleRowProps {
  icon: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const ToggleRow: React.FC<ToggleRowProps> = ({ icon, title, description, checked, onChange }) => (
  <div className={`gts-set-row${checked ? ' gts-on' : ''}`}>
    <span className="gts-set-ic" dangerouslySetInnerHTML={{ __html: icon }} />
    <span className="gts-set-text">
      <div className="gts-set-title">{title}</div>
      <div className="gts-set-desc">{description}</div>
    </span>
    <span className="gts-set-switch" onClick={() => onChange(!checked)}><span className="gts-set-knob" /></span>
  </div>
);

interface ButtonRowProps {
  icon: string;
  title: string;
  description: string;
  buttonLabel: string;
  disabled?: boolean;
  onClick: () => void;
}

export const ButtonRow: React.FC<ButtonRowProps> = ({ icon, title, description, buttonLabel, disabled, onClick }) => (
  <div className="gts-set-row">
    <span className="gts-set-ic" dangerouslySetInnerHTML={{ __html: icon }} />
    <span className="gts-set-text">
      <div className="gts-set-title">{title}</div>
      <div className="gts-set-desc">{description}</div>
    </span>
    <button className="gts-set-btn" disabled={disabled} onClick={onClick}>{buttonLabel}</button>
  </div>
);

interface SliderRowProps {
  icon: string;
  title: string;
  description: string;
  value: number;
  valueLabel: string;
  min?: number;
  max?: number;
  step?: number;
  editable?: boolean;
  inputSuffix?: string;
  onChange: (value: number) => void;
}

export const SliderRow: React.FC<SliderRowProps> = ({ icon, title, description, value, valueLabel, min = 0, max = 100, step = 1, editable = false, inputSuffix = '', onChange }) => {
  const fill = ((value - min) / (max - min)) * 100;
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    if (isNaN(n)) { setText(String(value)); return; }
    const clamped = Math.max(min, Math.min(max, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <div className={`gts-set-row gts-vert${value > min ? ' gts-on' : ''}`}>
      <div className="gts-set-head">
        <span className="gts-set-ic" dangerouslySetInnerHTML={{ __html: icon }} />
        <span className="gts-set-text">
          <div className="gts-set-title">{title}</div>
          <div className="gts-set-desc">{description}</div>
        </span>
        {editable ? (
          <span className="gts-set-val gts-set-val-edit">
            <input
              type="number"
              className="gts-set-num"
              min={min}
              max={max}
              step={step}
              value={text}
              onChange={(ev: React.ChangeEvent<HTMLInputElement>) => setText(ev.target.value)}
              onBlur={(ev: React.FocusEvent<HTMLInputElement>) => commit(ev.target.value)}
              onKeyDown={(ev: React.KeyboardEvent<HTMLInputElement>) => { if (ev.key === 'Enter') ev.currentTarget.blur(); }}
            />
            {inputSuffix ? <span className="gts-set-num-suffix">{inputSuffix}</span> : null}
          </span>
        ) : (
          <span className="gts-set-val">{valueLabel}</span>
        )}
      </div>
      <input
        type="range"
        className="gts-set-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ background: `linear-gradient(to right, #67c1f5 ${fill}%, rgba(255,255,255,0.12) ${fill}%)` }}
        onChange={(ev: React.ChangeEvent<HTMLInputElement>) => onChange(Number(ev.target.value))}
      />
    </div>
  );
};

export const formatLimit = (sec: number) => {
  if (sec <= 0) return 'Off';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
};
