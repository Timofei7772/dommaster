import { useState, useEffect } from 'react';

interface InvoiceItem { description: string; quantity: number; unit_price: number; total_price: number; }
interface Invoice { id: string; number: string; status: string; total_amount: number; date_issued: string; items?: InvoiceItem[]; }

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);

  useEffect(() => {
    fetch('/api/v1/invoices').then(r => r.json()).then(setInvoices);
  }, []);

  const open = (inv: Invoice) => {
    fetch(`/api/v1/invoices/${inv.id}`).then(r => r.json()).then(setSelected);
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Счета</h1>
      <table border={1} cellPadding={8} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th>Номер</th><th>Статус</th><th>Сумма</th><th>Дата</th><th></th></tr></thead>
        <tbody>{invoices.map(inv => (
          <tr key={inv.id}>
            <td>{inv.number}</td>
            <td>{inv.status}</td>
            <td>{inv.total_amount?.toFixed(2)}</td>
            <td>{new Date(inv.date_issued).toLocaleDateString()}</td>
            <td><button onClick={() => open(inv)}>Подробнее</button></td>
          </tr>
        ))}</tbody>
      </table>

      {selected && (
        <div style={{ marginTop: 24, padding: 16, border: '1px solid #ccc' }}>
          <h2>Счёт №{selected.number}</h2>
          <p>Статус: {selected.status}</p>
          <p>Дата: {new Date(selected.date_issued).toLocaleDateString()}</p>
          {selected.items && selected.items.length > 0 && (
            <>
              <h3>Позиции</h3>
              <table border={1} cellPadding={8} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th>Описание</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
                <tbody>{selected.items.map((it, i) => (
                  <tr key={i}><td>{it.description}</td><td>{it.quantity}</td><td>{it.unit_price?.toFixed(2)}</td><td>{it.total_price?.toFixed(2)}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          <button onClick={() => setSelected(null)}>Закрыть</button>
        </div>
      )}
    </div>
  );
}
