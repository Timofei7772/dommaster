import { Monitor, Trash2 } from 'lucide-react'
import { LicenseDevice } from '@/lib/electron'

interface ActiveDevicesProps {
  devices: LicenseDevice[]
  maxPcs?: number
  loading?: boolean
  deactivatingSlot?: number | null
  onDeactivate?: (slotId: number) => void | Promise<void>
}

export default function ActiveDevices({
  devices,
  maxPcs,
  loading = false,
  deactivatingSlot = null,
  onDeactivate,
}: ActiveDevicesProps) {
  if (!devices.length) {
    return null
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold">Активные устройства</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Использовано {devices.length}{maxPcs ? ` из ${maxPcs}` : ''} слотов активации
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {devices.map((device) => (
          <div
            key={`${device.slot}-${device.hardware_fingerprint}`}
            className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <p className="font-semibold">{device.device_name || `Устройство ${device.slot}`}</p>
                  <p className="text-xs text-slate-500 mt-1">Слот: {device.slot}</p>
                  <p className="text-xs text-slate-500">HWID: {device.hardware_fingerprint}</p>
                  {device.activated_at && (
                    <p className="text-xs text-slate-500">
                      Активировано: {new Date(device.activated_at).toLocaleString('ru-RU')}
                    </p>
                  )}
                </div>
              </div>

              {onDeactivate && (
                <button
                  type="button"
                  onClick={() => onDeactivate(device.slot)}
                  disabled={loading || deactivatingSlot === device.slot}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {deactivatingSlot === device.slot ? 'Освобождение...' : 'Деактивировать'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
