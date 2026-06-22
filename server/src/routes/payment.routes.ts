import { Router } from 'express'
import {
  getProjectPayments,
  createPayment,
  confirmPayment,
  deletePayment
} from '../controllers/payment.controller.js'
import { authenticateToken } from '../middleware/auth.middleware.js'

const router = Router()

router.use(authenticateToken as any)

router.get('/project/:projectId', getProjectPayments as any)
router.post('/project/:projectId', createPayment as any)
router.post('/:id/confirm', confirmPayment as any)
router.delete('/:id', deletePayment as any)

export default router
