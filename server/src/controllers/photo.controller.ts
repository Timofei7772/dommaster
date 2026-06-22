import { Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { AuthenticatedRequest } from '../middleware/auth.middleware.js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

// Создание папки uploads если её нет
const uploadDir = 'uploads'
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Настройка Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

export const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Разрешены только файлы изображений (.png, .jpg, .jpeg, .gif)'))
    }
  }
})

export const getProjectPhotos = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params

  try {
    const photos = await prisma.photoReport.findMany({
      where: {
        projectId: Number(projectId),
        project: { companyId: req.user?.companyId || 0 }
      },
      include: {
        stage: { select: { name: true } },
        uploader: { select: { fullName: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    const formatted = photos.map(p => ({
      id: p.id,
      project_id: p.projectId,
      stage_id: p.stageId,
      url: p.url,
      stage_name: p.stage ? p.stage.name : 'Общий отчет',
      uploader_name: p.uploader ? p.uploader.fullName : 'Неизвестно',
      created_at: p.createdAt.toISOString()
    }))

    return res.json(formatted)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка получения фотоотчетов: ' + err.message })
  }
}

export const createPhotoReport = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params
  const { stage_id } = req.body
  const files = req.files as Express.Multer.File[]

  if (!files || files.length === 0) {
    return res.status(400).json({ message: 'Файлы изображений не загружены' })
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: Number(projectId), companyId: req.user?.companyId || 0 }
    })

    if (!project) {
      return res.status(404).json({ message: 'Проект не найден' })
    }

    const uploadedRecords = []

    for (const file of files) {
      const photoReport = await prisma.photoReport.create({
        data: {
          url: `/uploads/${file.filename}`,
          projectId: Number(projectId),
          stageId: stage_id ? Number(stage_id) : null,
          uploadedBy: req.user?.id
        },
        include: {
          stage: { select: { name: true } },
          uploader: { select: { fullName: true } }
        }
      })

      uploadedRecords.push({
        id: photoReport.id,
        project_id: photoReport.projectId,
        stage_id: photoReport.stageId,
        url: photoReport.url,
        uploader_name: photoReport.uploader ? photoReport.uploader.fullName : 'Система',
        stage_name: photoReport.stage ? photoReport.stage.name : 'Общий отчет',
        created_at: photoReport.createdAt.toISOString()
      })
    }

    return res.status(201).json(uploadedRecords)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка сохранения отчетов: ' + err.message })
  }
}

export const deletePhotoReport = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params

  try {
    const existing = await prisma.photoReport.findUnique({
      where: { id: Number(id) },
      include: { project: true }
    })

    if (!existing || existing.project.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Фотоотчет не найден' })
    }

    // Удаляем файл с диска
    const filename = path.basename(existing.url)
    const filePath = path.join(uploadDir, filename)
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch (err) {
        console.error('Ошибка удаления файла с диска:', err)
      }
    }

    await prisma.photoReport.delete({ where: { id: Number(id) } })
    return res.json({ success: true, message: 'Фотоотчет удален' })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка удаления отчета: ' + err.message })
  }
}
