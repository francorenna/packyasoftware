import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const parseMode = () => {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))
  const modeValue = String(modeArg?.split('=')[1] ?? 'production').trim().toLowerCase()
  return modeValue === 'testing' ? 'testing' : 'production'
}

const mode = parseMode()
const envFilePath = path.join(projectRoot, `.env.${mode}.local`)

const parseEnv = (raw) => {
  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const idx = line.indexOf('=')
      if (idx <= 0) return acc
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      acc[key] = value
      return acc
    }, {})
}

const run = async () => {
  console.log(`Packya cloud smoke test (${mode.toUpperCase()})`)

  const envRaw = await fs.readFile(envFilePath, 'utf-8')
  const env = parseEnv(envRaw)

  const url = String(env.VITE_SUPABASE_URL || '').trim()
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()

  if (!url || !key) {
    throw new Error(`Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en ${path.basename(envFilePath)}`)
  }

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { count, error: countError } = await supabase
    .from('cloud_snapshots')
    .select('entity', { head: true, count: 'exact' })

  if (countError) {
    throw new Error(`Lectura cloud_snapshots falló: ${countError.message}`)
  }

  console.log(`Lectura OK. Filas actuales aproximadas: ${Number(count ?? 0)}`)

  const testEntity = `__packya_smoke_${mode}__`
  const testPayload = {
    source: 'local-smoke-test',
    checkedAt: new Date().toISOString(),
  }

  const { error: upsertError } = await supabase
    .from('cloud_snapshots')
    .upsert(
      {
        entity: testEntity,
        payload: testPayload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'entity' },
    )

  if (upsertError) {
    throw new Error(`Upsert cloud_snapshots falló: ${upsertError.message}`)
  }

  const { data: verifyRow, error: verifyError } = await supabase
    .from('cloud_snapshots')
    .select('entity,payload,updated_at')
    .eq('entity', testEntity)
    .maybeSingle()

  if (verifyError) {
    throw new Error(`Verificación de upsert falló: ${verifyError.message}`)
  }

  if (!verifyRow) {
    throw new Error('Upsert ejecutado, pero no se pudo leer la fila de prueba')
  }

  console.log('Upsert + verificación OK para cloud_snapshots')

  const { error: deleteError } = await supabase
    .from('cloud_snapshots')
    .delete()
    .eq('entity', testEntity)

  if (deleteError) {
    console.warn(`Limpieza no crítica falló: ${deleteError.message}`)
  } else {
    console.log('Limpieza OK: fila de smoke test eliminada')
  }

  console.log(`Resultado: OK. ${mode.toUpperCase()} responde y permite leer/escribir con publishable key.`)
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Resultado: FAIL. ${message}`)
  process.exitCode = 1
})
