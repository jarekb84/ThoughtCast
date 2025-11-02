import "./InfoRow.css";

interface InfoRowProps {
  label: string;
  value: string | React.ReactNode;
  className?: string;
}

/**
 * L1 Base InfoRow Component
 *
 * Displays a label-value pair with consistent styling.
 * Used for presenting session metadata and other key-value information.
 */
export default function InfoRow({ label, value, className = "" }: InfoRowProps) {
  return (
    <div className={`info-row ${className}`.trim()}>
      <span className="info-row-label">{label}:</span>
      <span className="info-row-value">{value}</span>
    </div>
  );
}
