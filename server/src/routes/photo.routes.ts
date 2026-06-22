import { Router } from 'express'
import {
  getProjectPhotos,
  createPhotoReport,
  deletePhotoReport,
  upload
} from '../controllers/photo.controller.js'
import { authenticateToken } from '../middleware/auth.middleware.js'

const router = Router()

router.use(authenticateToken as any)

router.get('/project/:projectId', getProjectPhotos as any)
router.post('/project/:projectId/upload', upload.array('files'), createPhotoReport as any)
router.delete('/:id', deletePhotoReport as any)

export default router
