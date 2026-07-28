import { useLayoutEffect, useRef } from "react";
import type { ChangeEvent } from "react";

import {
  formatNonNegativeIntegerInput,
  parseNonNegativeIntegerInput,
} from "../../utils/numberInput.util";

export type FormattedNumberInputProps = {
  value?: number | string | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
  inputClassName?: string;
  suffixClassName?: string;
  name?: string;
  id?: string;
  ariaLabel?: string;
};

function getCaretPosition(displayValue: string, digitPosition: number) {
  if (digitPosition <= 0) {
    return 0;
  }

  let digitCount = 0;

  for (let index = 0; index < displayValue.length; index += 1) {
    if (/\d/.test(displayValue[index])) {
      digitCount += 1;
    }

    if (digitCount === digitPosition) {
      return index + 1;
    }
  }

  return displayValue.length;
}

export default function FormattedNumberInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  readOnly = false,
  min,
  max,
  suffix,
  className = "",
  inputClassName = "",
  suffixClassName = "",
  name,
  id,
  ariaLabel,
}: FormattedNumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretDigitPosition = useRef<number | null>(null);
  const displayValue = formatNonNegativeIntegerInput(value);

  useLayoutEffect(() => {
    if (
      pendingCaretDigitPosition.current === null ||
      !inputRef.current
    ) {
      return;
    }

    const caretPosition = getCaretPosition(
      displayValue,
      pendingCaretDigitPosition.current,
    );
    inputRef.current.setSelectionRange(caretPosition, caretPosition);
    pendingCaretDigitPosition.current = null;
  }, [displayValue]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    const digitsBeforeCaret = rawValue
      .slice(0, event.target.selectionStart ?? rawValue.length)
      .replace(/\D/g, "").length;
    const digitsOnly = rawValue.replace(/\D/g, "");

    if (!digitsOnly) {
      pendingCaretDigitPosition.current = 0;
      onChange(null);
      return;
    }

    const numericValue = parseNonNegativeIntegerInput(digitsOnly);

    if (numericValue === null) {
      event.target.value = displayValue;
      return;
    }

    const normalizedDigitCount = String(numericValue).length;
    pendingCaretDigitPosition.current = Math.min(
      digitsBeforeCaret,
      normalizedDigitCount,
    );
    onChange(numericValue);
  };

  return (
    <div
      className={`${className} ${
        disabled ? "bg-slate-100 text-slate-400" : ""
      }`}
    >
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        className={inputClassName}
      />
      {suffix && (
        <span
          className={
            suffixClassName ||
            "shrink-0 text-xs font-extrabold text-slate-400"
          }
        >
          {suffix}
        </span>
      )}
    </div>
  );
}
