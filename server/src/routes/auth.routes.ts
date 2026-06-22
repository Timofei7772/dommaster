import { Router } from 'express'
import { register, login, refresh, getMe } from '../controllers/auth.controller.js'
import { authenticateToken } from '../middleware/auth.middleware.js'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.post('/refresh', refresh)
router.get('/me', authenticateToken as any, getMe as any)

export default router
