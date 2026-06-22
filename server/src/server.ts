import app from './app.js'

const PORT = process.env.PORT || 8000

app.listen(PORT, () => {
  console.log(`🚀 Construction CRM Server running on port ${PORT}`)
  console.log(`📂 Uploads directory mapped to http://localhost:${PORT}/uploads`)
})
