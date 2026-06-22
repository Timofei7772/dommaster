import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { staggerContainer, fadeInUp } from '@/lib/motion'
import Skeleton from './Skeleton'

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
}

export default function Table<T extends { id: number | string }>({
  columns,
  data,
  loading = false,
  searchTerm,
  onSearchChange,
  searchPlaceholder = 'Поиск...',
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  onRowClick
}: TableProps<T>) {
  return (
    <div className="space-y-4">
      {/* Search Input */}
      {onSearchChange && (
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full max-w-sm px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
          />
        </div>
      )}

      {/* Table Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-250 dark:border-slate-800">
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    style={{ width: col.width }}
                    className={`px-6 py-4.5 font-bold ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    <div className={`flex items-center gap-1.5 ${
                      col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'
                    }`}>
                      {col.header}
                      {col.sortable && <ArrowUpDown className="w-3.5 h-3.5 cursor-pointer text-slate-400 hover:text-slate-600" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {loading ? (
              <tbody>
                {Array.from({ length: 5 }).map((_, rIdx) => (
                  <tr key={rIdx} className="border-b border-slate-100 dark:border-slate-800/50">
                    {columns.map((_, cIdx) => (
                      <td key={cIdx} className="px-6 py-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : data.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-400 italic">
                    Записи не найдены
                  </td>
                </tr>
              </tbody>
            ) : (
              <motion.tbody
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="divide-y divide-slate-100 dark:divide-slate-800/50"
              >
                {data.map((row) => (
                  <motion.tr
                    key={row.id}
                    variants={fadeInUp}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                  >
                    {columns.map((col, cIdx) => {
                      const value = typeof col.accessor === 'function' ? col.accessor(row) : (row[col.accessor] as ReactNode)
                      return (
                        <td
                          key={cIdx}
                          className={`px-6 py-4 font-medium text-slate-700 dark:text-slate-200 ${
                            col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                          }`}
                        >
                          {value}
                        </td>
                      )
                    })}
                  </motion.tr>
                ))}
              </motion.tbody>
            )}
          </table>
        </div>

        {/* Pagination */}
        {onPageChange && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-150 dark:border-slate-850 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-xs text-slate-500">
              Страница {currentPage} из {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => onPageChange(currentPage - 1)}
                className="p-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                className="p-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
