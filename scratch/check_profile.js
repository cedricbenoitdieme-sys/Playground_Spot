import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ahqtcgxrewrfbowblygu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFocXRjZ3hyZXdyZmJvd2JseWd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTkzNzksImV4cCI6MjA5NTg5NTM3OX0.eCBg1OnsDLFHvmPFQyCNdXqqGHAXqFAjjDp_s5gYqcQ'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function run() {
  console.log('Querying profiles...')
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'cedricbenoitdieme@gmail.com')
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Result:', data)
  }
}

run()
