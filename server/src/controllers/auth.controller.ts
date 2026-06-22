import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { AuthenticatedRequest } from '../middleware/auth.middleware.js'

const SECRET_KEY = process.env.JWT_SECRET || 'smeta-ai-secret-key-change-in-production'
const ACCESS_EXPIRE = '8h'
const REFRESH_EXPIRE = '30d'

const generateTokens = (email: string) => {
  const accessToken = jwt.sign({ sub: email }, SECRET_KEY, { expiresIn: ACCESS_EXPIRE })
  const refreshToken = jwt.sign({ sub: email, type: 'refresh' }, SECRET_KEY, { expiresIn: REFRESH_EXPIRE })
  return { accessToken, refreshToken }
}

export const register = async (req: Request, res: Response) => {
  const { email, password, fullName, phone, role = 'OWNER', companyName } = req.body

  if (!email || !password || !fullName) {
    return res.status(400).json({ message: 'Заполните обязательные поля: email, пароль, ФИО' })
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(400).json({ message: 'Пользователь с таким email уже зарегистрирован' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    let companyId: number | null = null
    if (role === 'OWNER') {
      const company = await prisma.company.create({
        data: {
          name: companyName || `Компания ${fullName}`,
          bankDetails: 'ИНН=7700000000|Р/С=40702810000000000000|БИК=044525225|К/С=30101810400000000225'
        }
      })
      companyId = company.id
    }

    const { accessToken, refreshToken } = generateTokens(email)

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone,
        role,
        companyId,
        refreshToken
      },
      include: {
        company: true
      }
    })

    return res.status(201).json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        companyId: user.companyId,
        company: user.company
      }
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка при регистрации: ' + err.message })
  }
}

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Укажите email и пароль' })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true }
    })

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(400).json({ message: 'Неверный email или пароль' })
    }

    const { accessToken, refreshToken } = generateTokens(email)

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    })

    return res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        companyId: user.companyId,
        company: user.company
      }
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка входа: ' + err.message })
  }
}

export const refresh = async (req: Request, res: Response) => {
  const { refresh_token } = req.body

  if (!refresh_token) {
    return res.status(400).json({ message: 'Отсутствует refresh токен' })
  }

  try {
    const decoded = jwt.verify(refresh_token, SECRET_KEY) as { sub: string; type?: string }
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ message: 'Невалидный тип токена' })
    }

    const user = await prisma.user.findFirst({
      where: { email: decoded.sub, refreshToken: refresh_token },
      include: { company: true }
    })

    if (!user) {
      return res.status(401).json({ message: 'Сессия не найдена' })
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.email)

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken }
    })

    return res.json({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        companyId: user.companyId,
        company: user.company
      }
    })
  } catch (err: any) {
    return res.status(401).json({ message: 'Невалидный refresh токен' })
  }
}

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Неавторизован' })

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { company: true }
    })
    
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' })

    return res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      companyId: user.companyId,
      company: user.company
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка профиля: ' + err.message })
  }
}
