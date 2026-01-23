// Content Types
export type CallToActionType = 'first_comment' | 'keyword_response' | null;

export interface Video {
    id: string;
    original_filename: string;
    storage_path: string;
    description_template: string | null;
    call_to_action_type: CallToActionType;
    call_to_action_text: string | null;
    keyword_trigger: string | null;
    auto_response_text: string | null;
    created_at: string;
}

export interface VideoUploadInput {
    file: File;
    description_template: string;
    call_to_action_type: CallToActionType;
    call_to_action_text?: string;
    keyword_trigger?: string;
    auto_response_text?: string;
}
