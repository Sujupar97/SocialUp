/**
 * Account Creation Service
 * Calls the automation server's manual creation endpoints.
 */

import { AUTOMATION_SERVER } from '../utils/constants';

export interface ManualCreationSession {
    accountId: string;
    sessionId: string;
    windowId: string;
    liveViewUrl: string;
    email: string;
    password: string;
    proxyIp: string;
    recordingUrl: string;
}

export interface EmailCode {
    code: string;
    sender: string;
    subject: string;
    received_at: string;
}

export async function startManualCreation(platform: string): Promise<ManualCreationSession> {
    const response = await fetch(`${AUTOMATION_SERVER}/api/creation/start-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function completeManualCreation(accountId: string, username: string): Promise<void> {
    const response = await fetch(`${AUTOMATION_SERVER}/api/creation/complete-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, username }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${response.status}`);
    }
}

export async function cancelManualCreation(accountId: string): Promise<void> {
    const response = await fetch(`${AUTOMATION_SERVER}/api/creation/cancel-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${response.status}`);
    }
}

export async function getEmailInbox(email: string): Promise<EmailCode[]> {
    const response = await fetch(`${AUTOMATION_SERVER}/api/creation/email-inbox/${encodeURIComponent(email)}`);

    if (!response.ok) return [];

    const data = await response.json();
    return data.codes || [];
}
