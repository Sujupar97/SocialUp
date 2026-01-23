import { supabase } from './supabase';
import type { Video, VideoCopy } from '../types';

/**
 * Subir un video a Supabase Storage
 */
export async function uploadVideo(file: File): Promise<string> {
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const filePath = `videos/originals/${fileName}`;

    const { error } = await supabase.storage
        .from('content')
        .upload(filePath, file);

    if (error) {
        console.error('Error uploading video:', error);
        throw error;
    }

    return filePath;
}

/**
 * Crear registro de video en la base de datos
 */
export async function createVideo(input: {
    original_filename: string;
    storage_path: string;
    description_template: string | null;
    call_to_action_type: 'first_comment' | 'keyword_response' | null;
    call_to_action_text: string | null;
    keyword_trigger: string | null;
    auto_response_text: string | null;
}): Promise<Video> {
    const { data, error } = await supabase
        .from('videos')
        .insert([input])
        .select()
        .single();

    if (error) {
        console.error('Error creating video:', error);
        throw error;
    }

    return data;
}

/**
 * Obtener todos los videos
 */
export async function getVideos(): Promise<Video[]> {
    const { data, error } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching videos:', error);
        throw error;
    }

    return data || [];
}

/**
 * Obtener copias de video con info de cuenta
 */
export async function getVideoCopies(videoId?: string): Promise<VideoCopy[]> {
    let query = supabase
        .from('video_copies')
        .select(`
      *,
      account:accounts(username, platform, profile_photo_url)
    `)
        .order('created_at', { ascending: false });

    if (videoId) {
        query = query.eq('video_id', videoId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching video copies:', error);
        throw error;
    }

    return data || [];
}

/**
 * Crear copia de video (para distribución)
 */
export async function createVideoCopy(input: {
    video_id: string;
    account_id: string;
    copy_filename: string;
    storage_path: string;
    generated_description?: string;
}): Promise<VideoCopy> {
    const { data, error } = await supabase
        .from('video_copies')
        .insert([input])
        .select()
        .single();

    if (error) {
        console.error('Error creating video copy:', error);
        throw error;
    }

    return data;
}

/**
 * Actualizar estado de copia de video
 */
export async function updateVideoCopyStatus(
    id: string,
    status: 'pending' | 'publishing' | 'published' | 'failed',
    extra?: { external_post_id?: string; error_message?: string; published_at?: string }
): Promise<VideoCopy> {
    const updates: Record<string, unknown> = { status, ...extra };

    if (status === 'published' && !extra?.published_at) {
        updates.published_at = new Date().toISOString();
    }

    const { data, error } = await supabase
        .from('video_copies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating video copy status:', error);
        throw error;
    }

    return data;
}
