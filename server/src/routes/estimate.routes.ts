import { Router } from 'express'
import {
  getEstimateItems,
  assignItemExecutor,
  completeItem,
  exportToExcel,
  exportToPDF
} from '../controllers/estimate.controller.js'
import { authenticateToken } from '../middleware/auth.middleware.js'

const router = Router()

router.use(authenticateToken as any)

router.get('/:estimateId/items', getEstimateItems as any)
router.post('/items/:itemId/assign', assignItemExecutor as any)
router.post('/items/:itemId/complete', completeItem as any)
router.get('/:estimateId/export/excel', exportToExcel as any)
router.get('/:estimateId/export/pdf', exportToPDF as any)

export default router
