
import { useQuery } from '@tanstack/react-query';

interface Material {
  id: number;
  code?: string;
  name: string;
  category: string;
  unit: string;
  price: number;
}




export default function Materials() {
  // Пример: если нужен поиск и фильтрация, раскомментируйте и реализуйте UI
  // const [search, setSearch] = useState('');
  // const [category, setCategory] = useState('Все');

  // Загрузка материалов из БД через IPC
  const { data: materialsData = [], refetch } = useQuery({
    queryKey: ['catalog-materials'],
    queryFn: async () => {
      if (window.electronAPI?.catalog?.getMaterials) {
        const materials = await window.electronAPI.catalog.getMaterials('');
        return materials.map((m: any, index: number) => {
          const category = m.group_name || m.category || 'Прочие';
          const prefix = getMaterialPrefix(category);
          const shortCode = `${prefix}-${String(index + 1).padStart(3, '0')}`;
          return {
            id: m.id,
            code: shortCode,
            name: m.name,
            unit: m.unit || 'шт',
            price: m.price || 0,
            category: category
          };
        });
      }
      return [];
    },
    staleTime: 30000
  });

  function getMaterialPrefix(category: string): string {
    const prefixes: Record<string, string> = {
      'Смеси': 'СМ',
      'Краски': 'КР',
      'Гипсокартон': 'ГК',
      'Профили': 'ПР',
      'Изоляция': 'ИЗ',
      'Отделочные': 'ОТ',
      'Электрика': 'ЭЛ',
      'Сантехника': 'СТ',
      'Крепёж': 'КП',
      'Прочие': 'МТ'
    };
    return prefixes[category] || 'МТ';
  }

  // Импорт CSV
  async function handleImportCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/materials/import/csv', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      alert(data.message);
      refetch();
    };
    input.click();
  }

  // Импорт Excel
  async function handleImportExcel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/materials/import/excel', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      alert(data.message);
      refetch();
    };
    input.click();
  }

  // Импорт из API
  async function handleImportAPI() {
    const url = prompt('Введите URL API магазина');
    if (!url) return;
    const apiKey = prompt('Введите API-ключ (если требуется)') || '';
    const res = await fetch('/api/materials/import/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_url: url, api_key: apiKey })
    });
    const data = await res.json();
    alert(data.message);
    refetch();
  }

  // Обновление цен из API
  async function handleUpdatePricesAPI() {
    const url = prompt('Введите URL API магазина для обновления цен');
    if (!url) return;
    const apiKey = prompt('Введите API-ключ (если требуется)') || '';
    const res = await fetch('/api/materials/update-prices/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_url: url, api_key: apiKey })
    });
    const data = await res.json();
    alert(data.message);
    refetch();
  }

  // Пример JSX (замените на ваш реальный UI)
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex gap-2">
        <button onClick={handleImportCSV} className="btn-primary">Импорт CSV</button>
        <button onClick={handleImportExcel} className="btn-primary">Импорт Excel</button>
        <button onClick={handleImportAPI} className="btn-primary">Импорт из API</button>
        <button onClick={handleUpdatePricesAPI} className="btn-secondary">Обновить цены из API</button>
      </div>
      <div>
        <h2 className="font-bold text-lg mb-2">Справочник материалов</h2>
        <table className="w-full border">
          <thead>
            <tr>
              <th className="border px-2 py-1">Код</th>
              <th className="border px-2 py-1">Наименование</th>
              <th className="border px-2 py-1">Ед.</th>
              <th className="border px-2 py-1">Цена</th>
              <th className="border px-2 py-1">Категория</th>
            </tr>
          </thead>
          <tbody>
            {materialsData.map((m: Material) => (
              <tr key={m.id}>
                <td className="border px-2 py-1">{m.code}</td>
                <td className="border px-2 py-1">{m.name}</td>
                <td className="border px-2 py-1">{m.unit}</td>
                <td className="border px-2 py-1">{m.price}</td>
                <td className="border px-2 py-1">{m.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

