// A compact selector for the active endpoint. With `allowAll` it offers an
// "All endpoints" choice (value null) for the aggregate dashboard / audit view;
// without it the caller always works against a single flow.

export default function EndpointSwitcher({
  endpoints = [],
  value = null,
  onChange,
  allowAll = false,
  label = 'Endpoint',
}) {
  return (
    <label className="ep-switcher">
      <span className="ep-switcher__label">{label}</span>
      <select
        className="ep-switcher__select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {allowAll && <option value="">All endpoints</option>}
        {endpoints.map((e) => (
          <option key={e.slug} value={e.slug}>
            {e.name} · {e.rule_count} rule{e.rule_count === 1 ? '' : 's'}
            {e.judge ? ' · judge' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
