import { Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { AuthenticatedRequest } from '../middleware/auth.middleware.js'

export const getProjectRequests = async (req: AuthenticatedRequest, res: Response) => {
  const { project_id, status, assigned_to } = req.query

  try {
    if (!req.user || !req.user.companyId) {
      return res.status(400).json({ message: 'Компания не найдена' })
    }

    const requests = await prisma.cRMRequest.findMany({
      where: {
        project: {
          companyId: req.user.companyId
        },
        ...(project_id ? { projectId: Number(project_id) } : {}),
        ...(status ? { status: (status as string).toUpperCase() as any } : {}),
        ...(assigned_to ? { assignedTo: Number(assigned_to) } : {})
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, fullName: true, role: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    const formatted = requests.map(r => ({
      id: r.id,
      project_id: r.projectId,
      title: r.title,
      description: r.description,
      status: r.status === 'NEW' ? 'New' : r.status === 'IN_PROGRESS' ? 'In Progress' : r.status === 'REVIEW' ? 'Review' : 'Done',
      priority: r.priority === 'LOW' ? 'Low' : r.priority === 'MEDIUM' ? 'Medium' : 'High',
      assigned_to: r.assignedTo,
      deadline: r.deadline ? r.deadline.toISOString().split('T')[0] : null,
      project: r.project ? { id: r.project.id, name: r.project.name, code: r.project.code } : null,
      assignee: r.assignee ? { id: r.assignee.id, full_name: r.assignee.fullName } : null,
      created_at: r.createdAt.toISOString()
    }))

    return res.json(formatted)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка получения заявок: ' + err.message })
  }
}

export const createRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { title, description, project_id, status = 'New', priority = 'Medium', assigned_to, deadline } = req.body

  if (!title) {
    return res.status(400).json({ message: 'Название заявки обязательно' })
  }

  try {
    if (project_id) {
      const project = await prisma.project.findFirst({
        where: { id: Number(project_id), companyId: req.user?.companyId || 0 }
      })

      if (!project) {
        return res.status(400).json({ message: 'Указанный проект не найден в вашей компании' })
      }
    }

    // Приведение статуса/приоритета к enum
    const prismaStatus = status === 'In Progress' ? 'IN_PROGRESS' : status === 'Review' ? 'REVIEW' : status === 'Done' ? 'DONE' : 'NEW'
    const prismaPriority = priority === 'Low' ? 'LOW' : priority === 'High' ? 'HIGH' : 'MEDIUM'

    const request = await prisma.cRMRequest.create({
      data: {
        title,
        description,
        status: prismaStatus as any,
        priority: prismaPriority as any,
        projectId: Number(project_id),
        assignedTo: assigned_to ? Number(assigned_to) : null,
        deadline: deadline ? new Date(deadline) : null
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, fullName: true } }
      }
    })

    return res.status(201).json({
      id: request.id,
      project_id: request.projectId,
      title: request.title,
      description: request.description,
      status: status,
      priority: priority,
      assigned_to: request.assignedTo,
      deadline: request.deadline ? request.deadline.toISOString().split('T')[0] : null,
      project: request.project ? { id: request.project.id, name: request.project.name, code: request.project.code } : null,
      assignee: request.assignee ? { id: request.assignee.id, full_name: request.assignee.fullName } : null,
      created_at: request.createdAt.toISOString()
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка создания заявки: ' + err.message })
  }
}

export const updateRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params
  const { title, description, status, priority, assigned_to, deadline } = req.body

  try {
    const existing = await prisma.cRMRequest.findUnique({
      where: { id: Number(id) },
      include: { project: true }
    })

    if (!existing || existing.project.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Заявка не найдена' })
    }

    const prismaStatus = status === 'In Progress' ? 'IN_PROGRESS' : status === 'Review' ? 'REVIEW' : status === 'Done' ? 'DONE' : status === 'New' ? 'NEW' : undefined
    const prismaPriority = priority === 'Low' ? 'LOW' : priority === 'High' ? 'HIGH' : priority === 'Medium' ? 'MEDIUM' : undefined

    const updated = await prisma.cRMRequest.update({
      where: { id: Number(id) },
      data: {
        title: title !== undefined ? title : undefined,
        description: description !== undefined ? description : undefined,
        status: prismaStatus ? (prismaStatus as any) : undefined,
        priority: prismaPriority ? (prismaPriority as any) : undefined,
        assignedTo: assigned_to !== undefined ? (assigned_to ? Number(assigned_to) : null) : undefined,
        deadline: deadline !== undefined ? (deadline ? new Date(deadline) : null) : undefined
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, fullName: true } }
      }
    })

    const responseStatus = updated.status === 'IN_PROGRESS' ? 'In Progress' : updated.status === 'REVIEW' ? 'Review' : updated.status === 'DONE' ? 'Done' : 'New'
    const responsePriority = updated.priority === 'LOW' ? 'Low' : updated.priority === 'HIGH' ? 'High' : 'Medium'

    return res.json({
      id: updated.id,
      project_id: updated.projectId,
      title: updated.title,
      description: updated.description,
      status: responseStatus,
      priority: responsePriority,
      assigned_to: updated.assignedTo,
      deadline: updated.deadline ? updated.deadline.toISOString().split('T')[0] : null,
      project: updated.project ? { id: updated.project.id, name: updated.project.name, code: updated.project.code } : null,
      assignee: updated.assignee ? { id: updated.assignee.id, full_name: updated.assignee.fullName } : null,
      created_at: updated.createdAt.toISOString()
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка обновления заявки: ' + err.message })
  }
}

export const deleteRequest = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params

  try {
    const existing = await prisma.cRMRequest.findUnique({
      where: { id: Number(id) },
      include: { project: true }
    })

    if (!existing || existing.project.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Заявка не найдена' })
    }

    await prisma.cRMRequest.delete({ where: { id: Number(id) } })
    return res.json({ success: true, message: 'Заявка удалена' })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка удаления заявки: ' + err.message })
  }
}
