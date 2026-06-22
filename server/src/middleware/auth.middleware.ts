import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { UserRole } from '../types/index.js'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number
    email: string
    role: UserRole
    companyId: number | null
  }
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ message: 'Отсутствует авторизационный токен' })
  }

  try {
    const secret = process.env.JWT_SECRET || 'smeta-ai-secret-key-change-in-production'
    const decoded = jwt.verify(token, secret) as { sub: string }

    const user = await prisma.user.findUnique({
      where: { email: decoded.sub },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true
      }
    })

    if (!user) {
      return res.status(401).json({ message: 'Пользователь не найден' })
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      companyId: user.companyId
    }

    next()
  } catch (err) {
    return res.status(403).json({ message: 'Невалидный или устаревший токен' })
  }
}

export const requireRole = (roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Требуется аутентификация' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Недостаточно прав для выполнения операции' })
    }

    next()
  }
}
