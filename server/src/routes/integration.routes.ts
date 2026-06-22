import { Router } from 'express'
import {
  getSettings,
  saveSettings,
  syncAvito,
  sendMessage
} from '../controllers/integration.controller.js'
import { authenticateToken } from '../middleware/auth.middleware.js'

const router = Router()

router.use(authenticateToken as any)

router.get('/settings', getSettings as any)
router.post('/settings', saveSettings as any)
router.post('/avito/sync', syncAvito as any)
router.post('/message/send', sendMessage as any)

export default router
