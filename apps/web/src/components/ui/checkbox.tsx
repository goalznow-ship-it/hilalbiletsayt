import * as React from "react";
import { ReactNode } from "react";

export interface CheckboxProps {
  id?: string;
  className?: string;
  children?: ReactNode;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function Checkbox({
  id,
  className,
  children,
  checked,
  onChange,
}: CheckboxProps) {
  return (
    <input
      type="checkbox"
      id={id}
      className={className}
      checked={checked}
      onChange={onChange}
    />
  );
}
