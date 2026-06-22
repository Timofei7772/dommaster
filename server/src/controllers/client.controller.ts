import { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'

// Хелпер верификации гостевого токена
const verifyShareToken = async (token: string) => {
  const project = await prisma.project.findFirst({
    where: {
      description: {
        contains: `[SHARE_TOKEN: ${token}]`
      }
    }
  })

  if (!project) {
    throw new Error('Публичный доступ не найден или ссылка недействительна')
  }

  return project
}

export const getPublicProject = async (req: Request, res: Response) => {
  const { token } = req.params

  try {
    const project = await verifyShareToken(token)
    return res.json({
      id: project.id,
      name: project.name,
      code: project.code,
      status: project.status,
      planned_start: project.plannedStart ? project.plannedStart.toISOString().split('T')[0] : null,
      planned_end: project.plannedEnd ? project.plannedEnd.toISOString().split('T')[0] : null,
      budget: project.budget,
      spent: project.spent,
      description: project.description
    })
  } catch (err: any) {
    return res.status(404).json({ message: err.message })
  }
}

export const getPublicStages = async (req: Request, res: Response) => {
  const { token } = req.params

  try {
    const project = await verifyShareToken(token)
    const stages = await prisma.workStage.findMany({
      where: { projectId: project.id },
      orderBy: { startDate: 'asc' }
    })

    const formatted = stages.map(s => ({
      id: s.id,
      name: s.name,
      start_date: s.startDate.toISOString().split('T')[0],
      end_date: s.endDate.toISOString().split('T')[0],
      status: s.status.toLowerCase(),
      comments: s.comments ? JSON.parse(s.comments) : []
    }))

    return res.json(formatted)
  } catch (err: any) {
    return res.status(404).json({ message: err.message })
  }
}

export const getPublicPayments = async (req: Request, res: Response) => {
  const { token } = req.params

  try {
    const project = await verifyShareToken(token)
    const payments = await prisma.payment.findMany({
      where: { projectId: project.id },
      orderBy: { plannedDate: 'asc' }
    })

    const totalPlanned = payments.reduce((acc, p) => acc + p.plannedAmount, 0)
    const totalPaid = payments.filter(p => p.status === 'PAID').reduce((acc, p) => acc + p.actualAmount, 0)
    const totalRemaining = Math.max(0, totalPlanned - totalPaid)

    const formatted = payments.map(p => ({
      id: p.id,
      description: p.description,
      planned_date: p.plannedDate.toISOString().split('T')[0],
      planned_amount: p.plannedAmount,
      actual_amount: p.actualAmount,
      status: p.status.toLowerCase()
    }))

    return res.json({
      total_planned: totalPlanned,
      total_paid: totalPaid,
      total_remaining: totalRemaining,
      payments: formatted
    })
  } catch (err: any) {
    return res.status(404).json({ message: err.message })
  }
}

export const getPublicPhotos = async (req: Request, res: Response) => {
  const { token } = req.params

  try {
    const project = await verifyShareToken(token)
    const photos = await prisma.photoReport.findMany({
      where: { projectId: project.id },
      include: { stage: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    })

    const formatted = photos.map(p => ({
      id: p.id,
      url: p.url,
      stage_name: p.stage ? p.stage.name : 'Общий отчет',
      created_at: p.createdAt.toISOString()
    }))

    return res.json(formatted)
  } catch (err: any) {
    return res.status(404).json({ message: err.message })
  }
}

export const getPublicEstimates = async (req: Request, res: Response) => {
  const { token } = req.params

  try {
    const project = await verifyShareToken(token)
    const estimates = await prisma.estimate.findMany({
      where: { projectId: project.id },
      include: { items: true }
    })

    const formatted = estimates.map(est => ({
      id: est.id,
      name: est.name,
      total_with_vat: est.totalWithVat,
      items: est.items.map(i => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        quantity: i.quantity,
        total: i.total,
        row_type: i.rowType,
        is_work: i.isWork
      }))
    }))

    return res.json(formatted)
  } catch (err: any) {
    return res.status(404).json({ message: err.message })
  }
}

export const addStageComment = async (req: Request, res: Response) => {
  const { token, stageId } = req.params
  const { comment } = req.body

  if (!comment) {
    return res.status(400).json({ message: 'Комментарий пустой' })
  }

  try {
    const project = await verifyShareToken(token)
    const stage = await prisma.workStage.findFirst({
      where: { id: Number(stageId), projectId: project.id }
    })

    if (!stage) {
      return res.status(404).json({ message: 'Этап не найден' })
    }

    const comments = stage.comments ? JSON.parse(stage.comments) : []
    const dateStr = new Date().toLocaleDateString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    })
    comments.push(`Заказчик (${dateStr}): ${comment}`)

    const updated = await prisma.workStage.update({
      where: { id: stage.id },
      data: { comments: JSON.stringify(comments) }
    })

    return res.json({
      success: true,
      comments: JSON.parse(updated.comments || '[]')
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка отправки комментария: ' + err.message })
  }
}
