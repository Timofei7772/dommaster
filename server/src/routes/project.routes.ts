import { Router } from 'express'
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  getProjectDashboard,
  getProjectWorkers,
  generateShareLink
} from '../controllers/project.controller.js'
import { authenticateToken } from '../middleware/auth.middleware.js'

const router = Router()

router.use(authenticateToken as any)

router.get('/', listProjects as any)
router.post('/', createProject as any)
router.get('/:id', getProject as any)
router.put('/:id', updateProject as any)
router.delete('/:id', deleteProject as any)
router.get('/:id/dashboard', getProjectDashboard as any)
router.get('/:id/workers', getProjectWorkers as any)
router.post('/:id/share', generateShareLink as any)

export default router
