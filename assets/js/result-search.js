// A broad query crosses too many files; the complete snapshot is then cheaper.
export function planNameSearch(query, roster) {
  if (!Array.isArray(roster) || query.length < 2) return null;
  const people = roster.filter(person => String(person.name || '').includes(query));
  const shards = [...new Set(people.map(person => person.shard).filter(Boolean))];
  if (people.length > 12 || shards.length > 4) return null;
  return { ids: new Set(people.map(person => String(person.id))), shards };
}
