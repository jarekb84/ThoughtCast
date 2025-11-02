import "./Card.css";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "default" | "subtle" | "elevated";
}

/**
 * L1 Base Card Component
 *
 * Provides consistent card/container styling with subtle variations.
 * Used for grouping related information with proper visual hierarchy.
 */
export default function Card({
  children,
  className = "",
  padding = "md",
  variant = "default",
}: CardProps) {
  const paddingClass = `card-padding-${padding}`;
  const variantClass = `card-${variant}`;

  return (
    <div className={`card ${variantClass} ${paddingClass} ${className}`.trim()}>
      {children}
    </div>
  );
}
