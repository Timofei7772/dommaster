import { Router } from 'express'
import {
  getProjectStages,
  createStage,
  updateStage,
  deleteStage
} from '../controllers/stage.controller.js'
import { authenticateToken } from '../middleware/auth.middleware.js'

const router = Router()

router.use(authenticateToken as any)

router.get('/project/:projectId', getProjectStages as any)
router.post('/project/:projectId', createStage as any)
router.put('/:id', updateStage as any)
router.delete('/:id', deleteStage as any)

export default router
