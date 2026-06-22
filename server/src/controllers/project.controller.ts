import { Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { AuthenticatedRequest } from '../middleware/auth.middleware.js'
import crypto from 'crypto'

export const listProjects = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !req.user.companyId) {
    return res.status(400).json({ message: 'Компания не найдена' })
  }

  const { search, status } = req.query

  try {
    const projects = await prisma.project.findMany({
      where: {
        companyId: req.user.companyId,
        ...(status ? { status: status as any } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search as string, mode: 'insensitive' } },
                { address: { contains: search as string, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: 'desc' }
    })

    return res.json(projects)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка получения проектов: ' + err.message })
  }
}

export const createProject = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !req.user.companyId) {
    return res.status(400).json({ message: 'Компания не найдена' })
  }

  const { name, code, address, plannedStart, plannedEnd, budget, description, clientName, clientContact } = req.body

  if (!name || !address || !clientName) {
    return res.status(400).json({ message: 'Заполните обязательные поля: название, адрес, имя клиента' })
  }

  try {
    const project = await prisma.project.create({
      data: {
        name,
        code: code || `PRJ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        address,
        plannedStart: plannedStart ? new Date(plannedStart) : null,
        plannedEnd: plannedEnd ? new Date(plannedEnd) : null,
        budget: Number(budget) || 0.0,
        description,
        clientName,
        clientContact,
        companyId: req.user.companyId,
        createdById: req.user.id
      }
    })

    return res.status(201).json(project)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка создания проекта: ' + err.message })
  }
}

export const getProject = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params

  try {
    const project = await prisma.project.findFirst({
      where: { id: Number(id), companyId: req.user?.companyId || 0 }
    })

    if (!project) {
      return res.status(404).json({ message: 'Проект не найден' })
    }

    return res.json(project)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка получения проекта: ' + err.message })
  }
}

export const updateProject = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params
  const data = req.body

  try {
    const project = await prisma.project.findFirst({
      where: { id: Number(id), companyId: req.user?.companyId || 0 }
    })

    if (!project) {
      return res.status(404).json({ message: 'Проект не найден' })
    }

    const updated = await prisma.project.update({
      where: { id: Number(id) },
      data: {
        ...data,
        plannedStart: data.plannedStart ? new Date(data.plannedStart) : undefined,
        plannedEnd: data.plannedEnd ? new Date(data.plannedEnd) : undefined,
        actualStart: data.actualStart ? new Date(data.actualStart) : undefined,
        actualEnd: data.actualEnd ? new Date(data.actualEnd) : undefined,
        budget: data.budget !== undefined ? Number(data.budget) : undefined,
        spent: data.spent !== undefined ? Number(data.spent) : undefined
      }
    })

    return res.json(updated)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка обновления проекта: ' + err.message })
  }
}

export const deleteProject = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params

  try {
    const project = await prisma.project.findFirst({
      where: { id: Number(id), companyId: req.user?.companyId || 0 }
    })

    if (!project) {
      return res.status(404).json({ message: 'Проект не найден' })
    }

    await prisma.project.delete({ where: { id: Number(id) } })
    return res.json({ success: true, message: 'Проект удален' })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка удаления проекта: ' + err.message })
  }
}

export const getProjectDashboard = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params
  const projId = Number(id)

  try {
    const project = await prisma.project.findFirst({
      where: { id: projId, companyId: req.user?.companyId || 0 }
    })

    if (!project) {
      return res.status(404).json({ message: 'Проект не найден' })
    }

    // 1. Сбор этапов
    const stages = await prisma.workStage.findMany({ where: { projectId: projId } })
    const stagesTotal = stages.length
    const stagesCompleted = stages.filter(s => s.status === 'DONE').length
    const stagesInProgress = stages.filter(s => s.status === 'IN_PROGRESS').length
    const stagesDelayed = stages.filter(s => s.status === 'DELAYED').length
    const stagesNotStarted = stages.filter(s => s.status === 'NOT_STARTED').length

    // 2. Сбор платежей
    const payments = await prisma.payment.findMany({ where: { projectId: projId } })
    const paymentsTotalPlanned = payments.reduce((acc, p) => acc + p.plannedAmount, 0)
    const paymentsTotalPaid = payments.filter(p => p.status === 'PAID').reduce((acc, p) => acc + p.actualAmount, 0)
    const paymentsRemaining = Math.max(0, paymentsTotalPlanned - paymentsTotalPaid)

    // 3. Сметная стоимость
    const estimateItems = await prisma.estimateItem.findMany({
      where: {
        estimate: {
          projectId: projId
        }
      }
    })
    const estimatesTotal = estimateItems.reduce((acc, i) => acc + i.total, 0)

    // 4. Заявки
    const requests = await prisma.cRMRequest.findMany({ where: { projectId: projId } })
    const requestsNew = requests.filter(r => r.status === 'NEW').length
    const requestsInProgress = requests.filter(r => r.status === 'IN_PROGRESS').length
    const requestsDone = requests.filter(r => r.status === 'DONE').length

    return res.json({
      project_id: project.id,
      name: project.name,
      budget: project.budget,
      spent: project.spent,
      stages_total: stagesTotal,
      stages_completed: stagesCompleted,
      stages_in_progress: stagesInProgress,
      stages_delayed: stagesDelayed,
      stages_not_started: stagesNotStarted,
      payments_total_planned: paymentsTotalPlanned,
      payments_total_paid: paymentsTotalPaid,
      payments_remaining: paymentsRemaining,
      estimates_total: estimatesTotal,
      requests_new: requestsNew,
      requests_in_progress: requestsInProgress,
      requests_done: requestsDone
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка загрузки дашборда: ' + err.message })
  }
}

export const getProjectWorkers = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || !req.user.companyId) {
    return res.status(400).json({ message: 'Компания не найдена' })
  }

  try {
    const workers = await prisma.user.findMany({
      where: {
        companyId: req.user.companyId,
        role: { in: ['WORKER', 'MANAGER', 'OWNER'] }
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true
      },
      orderBy: { fullName: 'asc' }
    })

    return res.json(workers)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка получения сотрудников: ' + err.message })
  }
}

export const generateShareLink = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params
  const projId = Number(id)

  try {
    const project = await prisma.project.findFirst({
      where: { id: projId, companyId: req.user?.companyId || 0 }
    })

    if (!project) {
      return res.status(404).json({ message: 'Проект не найден' })
    }

    const shareToken = `share-${project.id}-${crypto.randomBytes(6).toString('hex')}`

    // Обновляем описание проекта, вставляя тэг SHARE_TOKEN
    const cleanDescription = (project.description || '').replace(/\[SHARE_TOKEN: [^\]]+\]/g, '').trim()
    const updatedDescription = `${cleanDescription}\n[SHARE_TOKEN: ${shareToken}]`.trim()

    await prisma.project.update({
      where: { id: project.id },
      data: { description: updatedDescription }
    })

    return res.json({
      success: true,
      share_token: shareToken,
      client_url: `http://localhost:5173/public/project/${shareToken}`
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка генерации ссылки: ' + err.message })
  }
}
