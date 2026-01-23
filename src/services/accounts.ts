import { supabase } from './supabase';
import type { Account, AccountCreateInput } from '../types';

/**
 * Obtener todas las cuentas
 */
export async function getAccounts(): Promise<Account[]> {
    const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching accounts:', error);
        throw error;
    }

    return data || [];
}

/**
 * Obtener cuentas activas
 */
export async function getActiveAccounts(): Promise<Account[]> {
    const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching active accounts:', error);
        throw error;
    }

    return data || [];
}

/**
 * Crear una nueva cuenta
 */
export async function createAccount(input: AccountCreateInput): Promise<Account> {
    const { data, error } = await supabase
        .from('accounts')
        .insert([input])
        .select()
        .single();

    if (error) {
        console.error('Error creating account:', error);
        throw error;
    }

    return data;
}

/**
 * Actualizar una cuenta
 */
export async function updateAccount(id: string, updates: Partial<Account>): Promise<Account> {
    const { data, error } = await supabase
        .from('accounts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating account:', error);
        throw error;
    }

    return data;
}

/**
 * Eliminar una cuenta
 */
export async function deleteAccount(id: string): Promise<void> {
    const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting account:', error);
        throw error;
    }
}

/**
 * Cambiar estado activo/inactivo de una cuenta
 */
export async function toggleAccountStatus(id: string, isActive: boolean): Promise<Account> {
    return updateAccount(id, { is_active: isActive });
}
