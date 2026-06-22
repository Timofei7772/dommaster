import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'

// Импорт роутов
import authRoutes from './routes/auth.routes.js'
import projectRoutes from './routes/project.routes.js'
import stageRoutes from './routes/stage.routes.js'
import paymentRoutes from './routes/payment.routes.js'
import photoRoutes from './routes/photo.routes.js'
import estimateRoutes from './routes/estimate.routes.js'
import requestRoutes from './routes/request.routes.js'
import clientRoutes from './routes/client.routes.js'
import integrationRoutes from './routes/integration.routes.js'

dotenv.config()

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Раздача статических фотоотчетов
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// Регистрация API эндпоинтов
app.use('/api/auth', authRoutes)
app.use('/api/crm-projects', projectRoutes)
app.use('/api/crm-stages', stageRoutes)
app.use('/api/crm-payments', paymentRoutes)
app.use('/api/crm-photos', photoRoutes)
app.use('/api/crm-estimates', estimateRoutes)
app.use('/api/crm-requests', requestRoutes)
app.use('/api/client-portal', clientRoutes)
app.use('/api/integrations', integrationRoutes)

// Обработчик ошибок
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(err.status || 500).json({
    message: err.message || 'Внутренняя ошибка сервера'
  })
})

export default app
