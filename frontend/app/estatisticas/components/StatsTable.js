export default function StatsTable({ rows }) {
  return (
    <div className="simple-table">
      {rows.map((item) => (
        <div key={item.key || item.label} className="table-row">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
