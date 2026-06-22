const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

process.env.SMETAAI_BUILD_CHANNEL = 'client-trial'

const { app } = require('electron')

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zaru-trial-snapshot-'))
const userDataDir = path.join(tempRoot, 'userData')
fs.mkdirSync(userDataDir, { recursive: true })
app.setPath('userData', userDataDir)

const db = require('../src/database')
const { buildEstimateDocumentSnapshot } = require('../src/document-mappers/estimateSnapshot')

async function main() {
  await app.whenReady()
  await db.initDatabase()

  const project = db.createProject({
    name: 'Trial verification project',
    client_name: 'Trial client',
    address: 'Trial address'
  })

  const firstEstimate = db.createEstimate({
    project_id: project.id,
    name: 'Trial estimate',
    number: 'TRIAL-001',
    estimate_type: 'local'
  })

  db.setCoefficients(firstEstimate.id, { work_coef: 1.8, material_coef: 1.04 })
  const section = db.createEstimateSection({
    estimate_id: firstEstimate.id,
    name: 'Отделочные работы',
    sort_order: 0
  })

  db.createEstimateItem({
    estimate_id: firstEstimate.id,
    section_id: section.id,
    name: 'Штукатурка стен',
    unit: 'м2',
    quantity: 12,
    materials_cost: 100,
    labor_cost: 200,
    row_type: 'rascenka',
    sort_order: 0
  })

  const snapshot = buildEstimateDocumentSnapshot({
    db,
    estimateId: firstEstimate.id,
    documentType: 'estimate',
    source: 'verification-script'
  })

  assert.strictEqual(snapshot.documentType, 'estimate')
  assert.strictEqual(snapshot.metadata.buildChannel, 'client-trial')
  assert.strictEqual(snapshot.estimate.id, firstEstimate.id)
  assert.strictEqual(snapshot.project.id, project.id)
  assert.strictEqual(snapshot.sections.length, 1)
  assert.strictEqual(snapshot.items.length, 1)
  assert.strictEqual(snapshot.coefficients.work_coef, 1.8)
  assert.strictEqual(snapshot.lineage.sourceEstimateId, firstEstimate.id)
  assert.strictEqual(snapshot.source, 'verification-script')

  let trialError = null
  try {
    db.createEstimate({
      project_id: project.id,
      name: 'Blocked trial estimate',
      number: 'TRIAL-002',
      estimate_type: 'local'
    })
  } catch (error) {
    trialError = error
  }

  assert(trialError, 'Second estimate should be blocked in client trial mode')
  assert.strictEqual(trialError.code, 'TRIAL_LIMIT_REACHED')
  assert.match(trialError.message, /пробн/i)

  console.log('trial and snapshot verification passed')
}

main()
  .then(() => {
    try { db.closeDatabase() } catch (error) {}
    app.exit(0)
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error)
    try { db.closeDatabase() } catch (closeError) {}
    app.exit(1)
  })
