import { useState, useEffect } from 'react';

interface Resource { id: string; name: string; type: string; quantity_total: number; cost_per_unit: number; }

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);

  useEffect(() => {
    fetch('/api/v1/resources').then(r => r.json()).then(setResources);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Ресурсы</h1>
      <table border={1} cellPadding={8} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th>Название</th><th>Тип</th><th>Количество</th><th>Цена за ед.</th></tr></thead>
        <tbody>{resources.map(r => (
          <tr key={r.id}>
            <td>{r.name}</td>
            <td>{r.type}</td>
            <td>{r.quantity_total}</td>
            <td>{r.cost_per_unit}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
