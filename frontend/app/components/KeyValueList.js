export default function KeyValueList({ items }) {
  return (
    <dl className="keyvalue-list">
      {items.map((item) => (
        <div key={item.label} className="keyvalue-row">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
