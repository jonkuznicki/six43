'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'

export function useBetaFeatures() {
  const [betaFeatures, setBetaFeatures] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      supabase
        .from('profiles')
        .select('beta_features')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          setBetaFeatures(data?.beta_features ?? false)
          setLoading(false)
        })
    })
  }, [])

  return { betaFeatures, loading }
}
