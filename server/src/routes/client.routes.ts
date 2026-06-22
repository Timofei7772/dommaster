import { Router } from 'express'
import {
  getPublicProject,
  getPublicStages,
  getPublicPayments,
  getPublicPhotos,
  getPublicEstimates,
  addStageComment
} from '../controllers/client.controller.js'

const router = Router()

router.get('/:token', getPublicProject)
router.get('/:token/stages', getPublicStages)
router.get('/:token/payments', getPublicPayments)
router.get('/:token/photos', getPublicPhotos)
router.get('/:token/estimates', getPublicEstimates)
router.post('/:token/stages/:stageId/comment', addStageComment)

export default router
