import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "warning";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

/**
 * L1 Base Button Component
 *
 * Provides consistent button styling across the application with multiple variants.
 * Internally handles responsive sizing and hover states.
 */
export default function Button({
  variant = "primary",
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseClass = "btn";
  const variantClass = `btn-${variant}`;
  const disabledClass = disabled ? "btn-disabled" : "";

  return (
    <button
      className={`${baseClass} ${variantClass} ${disabledClass} ${className}`.trim()}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
