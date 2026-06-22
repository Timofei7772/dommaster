import { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { AuthenticatedRequest } from '../middleware/auth.middleware.js'

export const getProjectStages = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params

  try {
    const stages = await prisma.workStage.findMany({
      where: {
        projectId: Number(projectId),
        project: { companyId: req.user?.companyId || 0 }
      },
      include: {
        executor: {
          select: { id: true, fullName: true, role: true }
        }
      },
      orderBy: { startDate: 'asc' }
    })

    // Преобразуем формат под фронтенд (ключи в snake_case, комменты в массив строк)
    const formatted = stages.map(s => ({
      id: s.id,
      project_id: s.projectId,
      name: s.name,
      executor_id: s.executorId,
      start_date: s.startDate.toISOString().split('T')[0],
      end_date: s.endDate.toISOString().split('T')[0],
      status: s.status.toLowerCase(),
      executor: s.executor ? { id: s.executor.id, full_name: s.executor.fullName, role: s.executor.role } : null,
      comments: s.comments ? JSON.parse(s.comments) : []
    }))

    return res.json(formatted)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка получения этапов: ' + err.message })
  }
}

export const createStage = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params
  const { name, executor_id, start_date, end_date, status = 'NOT_STARTED' } = req.body

  if (!name || !start_date || !end_date) {
    return res.status(400).json({ message: 'Название, даты начала и окончания обязательны' })
  }

  try {
    const stage = await prisma.workStage.create({
      data: {
        name,
        startDate: new Date(start_date),
        endDate: new Date(end_date),
        status: (status as string).toUpperCase() as any,
        projectId: Number(projectId),
        executorId: executor_id ? Number(executor_id) : null,
        comments: JSON.stringify([])
      }
    })

    return res.status(201).json(stage)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка добавления этапа: ' + err.message })
  }
}

export const updateStage = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params
  const { name, executor_id, start_date, end_date, status } = req.body

  try {
    const existing = await prisma.workStage.findUnique({
      where: { id: Number(id) },
      include: { project: true }
    })

    if (!existing || existing.project.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Этап не найден' })
    }

    const updated = await prisma.workStage.update({
      where: { id: Number(id) },
      data: {
        ...(name ? { name } : {}),
        ...(start_date ? { startDate: new Date(start_date) } : {}),
        ...(end_date ? { endDate: new Date(end_date) } : {}),
        ...(status ? { status: (status as string).toUpperCase() as any } : {}),
        executorId: executor_id !== undefined ? (executor_id ? Number(executor_id) : null) : undefined
      }
    })

    return res.json(updated)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка обновления этапа: ' + err.message })
  }
}

export const deleteStage = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params

  try {
    const existing = await prisma.workStage.findUnique({
      where: { id: Number(id) },
      include: { project: true }
    })

    if (!existing || existing.project.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Этап не найден' })
    }

    await prisma.workStage.delete({ where: { id: Number(id) } })
    return res.json({ success: true, message: 'Этап удален' })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка удаления этапа: ' + err.message })
  }
}
