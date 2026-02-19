import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://eeswugfozxpwxpmwcfyh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlc3d1Z2Zvenhwd3hwbXdjZnloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMTA1OTYsImV4cCI6MjA4Njg4NjU5Nn0.UzMmVPE5mMU9kH7owL0Pe_rsUyUqVxfM8jO31WyKFnw';

export const supabase = createClient(supabaseUrl, supabaseKey);