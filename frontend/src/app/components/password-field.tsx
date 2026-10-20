"use client";
import { useId, useState } from "react";
import styles from "./auth-flow.module.css";
export default function PasswordField({ label, value, onChange, disabled, error, helper, autoComplete = "new-password", minimum = 12 }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; error?: string; helper?: string; autoComplete?: "new-password" | "current-password"; minimum?: number }) {
  const id = useId(); const [visible, setVisible] = useState(false);
  return <div className={styles.field}>
    <label className={styles.label} htmlFor={id}>{label}</label>
    <div className={styles.passwordWrap}>
      <input className={styles.input} id={id} type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} minLength={minimum} maxLength={1024} required disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? id + "-error" : helper ? id + "-help" : undefined} />
      <button className={styles.toggle} type="button" disabled={disabled} aria-label={`${visible ? "Ẩn" : "Hiện"} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(current => !current)}>{visible ? "Ẩn" : "Hiện"}</button>
    </div>
    {error ? <p className={styles.fieldError} id={id + "-error"}>{error}</p> : helper ? <p className={styles.help} id={id + "-help"}>{helper}</p> : null}
  </div>;
}
