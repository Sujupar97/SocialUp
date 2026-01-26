
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nyxpkfjkgpjipejsrbac.supabase.co';
// Using Service Role Key (user provided previously) for admin privileges to delete all data
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eHBrZmprZ3BqaXBlanNyYmFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ5MDk1MiwiZXhwIjoyMDg0MDY2OTUyfQ.ogx-LKSiihCU3ohzlSEAfUszwLQ9jlzya_Lt0ttrujs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanDatabase() {
    console.log('🧹 Starting database cleanup...');

    // Delete in order of dependencies (child tables first)

    // 1. Analytics
    console.log('Deleting Analytics...');
    const { error: err1 } = await supabase.from('analytics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (err1) console.error('Error cleaning analytics:', err1);

    // 2. Auto Comments & Keyword Responses
    console.log('Deleting Auto Comments & Responses...');
    await supabase.from('auto_comments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('keyword_responses').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 3. Video Copies
    console.log('Deleting Video Copies...');
    const { error: err2 } = await supabase.from('video_copies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (err2) console.error('Error cleaning video copies:', err2);

    // 4. Accounts (This is the main one)
    console.log('Deleting Accounts...');
    const { error: err3 } = await supabase.from('accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (err3) console.error('Error cleaning accounts:', err3);

    // 5. Videos (Originals)
    console.log('Deleting Original Videos...');
    const { error: err4 } = await supabase.from('videos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (err4) console.error('Error cleaning videos:', err4);

    console.log('✨ Cleanup complete! The database is now empty of test data.');
}

cleanDatabase();
