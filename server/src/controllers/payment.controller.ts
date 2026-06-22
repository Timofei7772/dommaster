import { Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { AuthenticatedRequest } from '../middleware/auth.middleware.js'

export const getProjectPayments = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params
  const { start_date, end_date } = req.query

  try {
    const start = start_date ? new Date(start_date as string) : undefined
    const end = end_date ? new Date(end_date as string) : undefined

    const payments = await prisma.payment.findMany({
      where: {
        projectId: Number(projectId),
        project: { companyId: req.user?.companyId || 0 },
        ...(start || end
          ? {
              plannedDate: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lte: end } : {})
              }
            }
          : {})
      },
      orderBy: { plannedDate: 'asc' }
    })

    const totalPlanned = payments.reduce((acc, p) => acc + p.plannedAmount, 0)
    const totalPaid = payments.filter(p => p.status === 'PAID').reduce((acc, p) => acc + p.actualAmount, 0)
    const totalRemaining = Math.max(0, totalPlanned - totalPaid)

    // Преобразуем формат под фронтенд (snake_case)
    const formatted = payments.map(p => ({
      id: p.id,
      project_id: p.projectId,
      description: p.description,
      planned_date: p.plannedDate.toISOString().split('T')[0],
      planned_amount: p.plannedAmount,
      actual_date: p.actualDate ? p.actualDate.toISOString().split('T')[0] : null,
      actual_amount: p.actualAmount,
      status: p.status.toLowerCase(),
      paid_at: p.paidAt ? p.paidAt.toISOString() : null
    }))

    return res.json({
      total_planned: totalPlanned,
      total_paid: totalPaid,
      total_remaining: totalRemaining,
      payments: formatted
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка получения платежей: ' + err.message })
  }
}

export const createPayment = async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params
  const { description, planned_date, planned_amount } = req.body

  if (!description || !planned_date || !planned_amount) {
    return res.status(400).json({ message: 'Заполните описание, плановую дату и сумму' })
  }

  try {
    const payment = await prisma.payment.create({
      data: {
        description,
        plannedDate: new Date(planned_date),
        plannedAmount: Number(planned_amount),
        projectId: Number(projectId),
        status: 'PLANNED'
      }
    })

    return res.status(201).json(payment)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка добавления платежа: ' + err.message })
  }
}

export const confirmPayment = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params
  const { actual_amount } = req.body

  try {
    const existing = await prisma.payment.findUnique({
      where: { id: Number(id) },
      include: { project: true }
    })

    if (!existing || existing.project.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Платеж не найден' })
    }

    const updated = await prisma.payment.update({
      where: { id: Number(id) },
      data: {
        status: 'PAID',
        actualAmount: Number(actual_amount) || existing.plannedAmount,
        actualDate: new Date(),
        paidAt: new Date()
      }
    })

    // Обновим расходы по проекту (spent) на полученную сумму
    await prisma.project.update({
      where: { id: existing.projectId },
      data: {
        spent: {
          increment: Number(actual_amount) || existing.plannedAmount
        }
      }
    })

    return res.json(updated)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка подтверждения платежа: ' + err.message })
  }
}

export const deletePayment = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params

  try {
    const existing = await prisma.payment.findUnique({
      where: { id: Number(id) },
      include: { project: true }
    })

    if (!existing || existing.project.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Платеж не найден' })
    }

    // Если удаляем оплаченный, уменьшим расходы проекта
    if (existing.status === 'PAID') {
      await prisma.project.update({
        where: { id: existing.projectId },
        data: {
          spent: {
            decrement: existing.actualAmount
          }
        }
      })
    }

    await prisma.payment.delete({ where: { id: Number(id) } })
    return res.json({ success: true, message: 'Платеж удален' })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка удаления платежа: ' + err.message })
  }
}
