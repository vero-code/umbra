export default function ProtectionChoices({ label, options, value, onChange }) {
  return (
    <section className="protectionGroup">
      <p className="eyebrow">{label}</p>
      <div className="protectionChoices">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? "isSelected" : ""}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            <b>{option.label}</b>
            <small>{option.detail}</small>
            {option.badge && <em>{option.badge}</em>}
          </button>
        ))}
      </div>
    </section>
  );
}
