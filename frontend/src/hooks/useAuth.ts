import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'

export interface Company {
  id: number
  name: string
  logo?: string
  bank_details?: string
}

export interface UserProfile {
  id: number
  email: string
  full_name: string
  phone?: string
  position?: string
  role: 'admin' | 'manager' | 'estimator' | 'viewer' | 'owner' | 'worker' | 'client'
  company_id?: number
  company?: Company
}

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem('user_profile')
    return cached ? JSON.parse(cached) : null
  })
  const [loading, setLoading] = useState(true)

  const isAuthenticated = !!user

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token && !user) {
      // Пытаемся восстановить профиль с сервера
      apiGet<UserProfile>('/auth/me')
        .then((profile) => {
          setUser(profile)
          localStorage.setItem('user_profile', JSON.stringify(profile))
        })
        .catch(() => {
          // Если токен невалидный, очищаем
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('user_profile')
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [user])

  const login = async (email: string, pass: string) => {
    setLoading(true)
    try {
      const res = await apiPost<{ access_token: string; refresh_token: string; user: UserProfile }>('/auth/login', {
        email,
        password: pass
      })
      localStorage.setItem('access_token', res.access_token)
      localStorage.setItem('refresh_token', res.refresh_token)
      localStorage.setItem('user_profile', JSON.stringify(res.user))
      setUser(res.user)
      return res.user
    } finally {
      setLoading(false)
    }
  }

  const register = async (
    email: string,
    pass: string,
    fullName: string,
    phone: string,
    role: string,
    companyName?: string
  ) => {
    setLoading(true)
    try {
      const res = await apiPost<{ access_token: string; refresh_token: string; user: UserProfile }>('/auth/register', {
        email,
        password: pass,
        full_name: fullName,
        phone,
        role,
        company_name: companyName
      })
      localStorage.setItem('access_token', res.access_token)
      localStorage.setItem('refresh_token', res.refresh_token)
      localStorage.setItem('user_profile', JSON.stringify(res.user))
      setUser(res.user)
      return res.user
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_profile')
    setUser(null)
    window.location.href = '/login'
  }

  return {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout
  }
}
