export function ConfidenceGauge({
  value,
  label = "Overall evidence confidence"
}: {
  value: number;
  label?: string;
}) {
  const normalized = Math.max(0, Math.min(100, value));
  const radius = 54;
  const circumference = Math.PI * radius;
  const progress = (normalized / 100) * circumference;

  return (
    <div className="confidence-gauge">
      <svg viewBox="0 0 132 76" role="img" aria-label={`${label}: ${value}%`}>
        <path
          d="M 12 66 A 54 54 0 0 1 120 66"
          fill="none"
          stroke="var(--line)"
          strokeWidth="10"
          strokeLinecap="round"
          pathLength={circumference}
        />
        <path
          d="M 12 66 A 54 54 0 0 1 120 66"
          fill="none"
          stroke="var(--lime)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          pathLength={circumference}
        />
      </svg>
      <strong>{value}%</strong>
      <span>{label}</span>
    </div>
  );
}
