import { useEffect, useState } from 'react'
import { getSupabaseClient, isSupabaseConfigured } from '../integrations/supabaseClient'

export default function useAuthState() {
  // undefined = cargando, null = no logueado, object = sesión activa
  const [session, setSession] = useState(() => (isSupabaseConfigured ? undefined : null))

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined

    const supabase = getSupabaseClient()
    if (!supabase) return undefined

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('Supabase no configurado')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const signInWithGoogle = async () => {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('Supabase no configurado')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    })
    if (error) throw error
  }

  const signOut = async () => {
    const supabase = getSupabaseClient()
    if (supabase) await supabase.auth.signOut()
  }

  return {
    session,
    isLoading: session === undefined,
    signIn,
    signInWithGoogle,
    signOut,
  }
}
