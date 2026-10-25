import { ReactNode } from "react";

export interface LabelProps {
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function Label({ htmlFor, className, children }: LabelProps) {
  return (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  );
}
