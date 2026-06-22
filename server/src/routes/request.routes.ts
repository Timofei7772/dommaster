import { Router } from 'express'
import {
  getProjectRequests,
  createRequest,
  updateRequest,
  deleteRequest
} from '../controllers/request.controller.js'
import { authenticateToken } from '../middleware/auth.middleware.js'

const router = Router()

router.use(authenticateToken as any)

router.get('/', getProjectRequests as any)
router.post('/', createRequest as any)
router.put('/:id', updateRequest as any)
router.delete('/:id', deleteRequest as any)

export default router
