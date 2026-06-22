import { useState, useEffect, useCallback } from 'react';

/**
 * Хук для работы с localStorage с автосохранением
 * @param key - ключ для хранения
 * @param initialValue - начальное значение
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // Получаем начальное значение из localStorage или используем initialValue
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn('Ошибка чтения localStorage:', key, error);
      return initialValue;
    }
  });

  // Сохраняем в localStorage при изменении
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.warn('Ошибка записи в localStorage:', key, error);
    }
  }, [key, storedValue]);

  // Функция для сброса к начальному значению
  const reset = useCallback(() => {
    setStoredValue(initialValue);
    window.localStorage.removeItem(key);
  }, [key, initialValue]);

  return [storedValue, setStoredValue, reset];
}

/**
 * Хук для хранения данных с версионированием и миграцией
 */
export function useVersionedStorage<T>(
  key: string, 
  version: number, 
  initialValue: T,
  migrate?: (oldData: any, oldVersion: number) => T
): [T, (value: T | ((prev: T) => T)) => void] {
  const versionKey = key + '_version';
  
  const [data, setData] = useState<T>(() => {
    try {
      const storedVersion = parseInt(window.localStorage.getItem(versionKey) || '0');
      const item = window.localStorage.getItem(key);
      
      if (!item) return initialValue;
      
      const parsed = JSON.parse(item);
      
      // Миграция если версия старая
      if (storedVersion < version && migrate) {
        const migrated = migrate(parsed, storedVersion);
        window.localStorage.setItem(key, JSON.stringify(migrated));
        window.localStorage.setItem(versionKey, String(version));
        return migrated;
      }
      
      return parsed;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(data));
    window.localStorage.setItem(versionKey, String(version));
  }, [key, version, data, versionKey]);

  return [data, setData];
}

/**
 * Генерация уникального ID
 */
export function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

/**
 * Форматирование даты для отображения
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Форматирование суммы с разделителями
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(amount);
}
