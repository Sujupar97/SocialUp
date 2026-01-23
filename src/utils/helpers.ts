// Helper functions

/**
 * Format number with compact notation (1K, 1M, etc.)
 */
export function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
}

/**
 * Format date to readable string
 */
export function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Format time ago
 */
export function timeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'hace un momento';
    if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
    if (seconds < 604800) return `hace ${Math.floor(seconds / 86400)} días`;
    return formatDate(dateString);
}

/**
 * Generate unique filename for video copy
 */
export function generateCopyFilename(originalFilename: string, accountId: string): string {
    const timestamp = Date.now();
    const ext = originalFilename.split('.').pop();
    const baseName = originalFilename.replace(/\.[^/.]+$/, '');
    return `${baseName}_${accountId.slice(0, 8)}_${timestamp}.${ext}`;
}

/**
 * Calculate engagement rate
 */
export function calculateEngagementRate(
    likes: number,
    comments: number,
    shares: number,
    views: number
): number {
    if (views === 0) return 0;
    return ((likes + comments + shares) / views) * 100;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

/**
 * Delay execution
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate URL
 */
export function isValidUrl(urlString: string): boolean {
    try {
        new URL(urlString);
        return true;
    } catch {
        return false;
    }
}
