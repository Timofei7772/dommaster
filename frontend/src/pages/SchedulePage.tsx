import { useState, useEffect } from 'react';

interface ScheduleEntry { id: string; task_id: string; resource_id?: string; start_datetime: string; end_datetime: string; notes?: string; }

export default function SchedulePage() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);

  useEffect(() => {
    fetch('/api/v1/schedule').then(r => r.json()).then(setEntries);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Расписание</h1>
      <table border={1} cellPadding={8} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th>Задача</th><th>Ресурс</th><th>Начало</th><th>Конец</th><th>Примечание</th></tr></thead>
        <tbody>{entries.map(s => (
          <tr key={s.id}>
            <td>{s.task_id.slice(0,8)}</td>
            <td>{s.resource_id ? s.resource_id.slice(0,8) : '-'}</td>
            <td>{new Date(s.start_datetime).toLocaleString()}</td>
            <td>{new Date(s.end_datetime).toLocaleString()}</td>
            <td>{s.notes || ''}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
