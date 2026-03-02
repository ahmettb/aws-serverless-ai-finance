import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import api from '../api';

// Mock the API and toast
jest.mock('../api');
jest.mock('react-hot-toast', () => ({
    toast: {
        error: jest.fn(),
        success: jest.fn(),
    },
}));

describe('Login Component Critical Paths', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });

    test('renders login form correctly', () => {
        render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>
        );

        expect(screen.getByText('Tekrar Hoş Geldiniz')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('E-posta adresiniz')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Şifreniz')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Giriş Yap/i })).toBeInTheDocument();
    });

    test('shows error toast on failed login', async () => {
        const { toast } = require('react-hot-toast');

        // Mock API to return an error (e.g. 401 Unauthorized)
        api.login.mockRejectedValue({
            response: { data: { error: 'Geçersiz e-posta veya şifre!' } }
        });

        render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>
        );

        // Fill in the form
        fireEvent.change(screen.getByPlaceholderText('E-posta adresiniz'), { target: { value: 'test@test.com' } });
        fireEvent.change(screen.getByPlaceholderText('Şifreniz'), { target: { value: 'wrongpass' } });

        // Submit
        fireEvent.click(screen.getByRole('button', { name: /Giriş Yap/i }));

        // Expect the error toast to be called
        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Geçersiz e-posta veya şifre!');
        });
    });

    test('successful login sets token and redirects', async () => {
        // Mock API to succeed
        api.login.mockResolvedValue({
            data: {
                tokens: { access_token: 'fake-token' },
                user: { email: 'test@test.com' }
            }
        });

        render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>
        );

        fireEvent.change(screen.getByPlaceholderText('E-posta adresiniz'), { target: { value: 'test@test.com' } });
        fireEvent.change(screen.getByPlaceholderText('Şifreniz'), { target: { value: 'correctpass' } });
        fireEvent.click(screen.getByRole('button', { name: /Giriş Yap/i }));

        await waitFor(() => {
            // LocalStorage should have the token saved
            expect(localStorage.getItem('token')).toBe('fake-token');
            // The API should have been called
            expect(api.login).toHaveBeenCalledWith('test@test.com', 'correctpass');
        });
    });
});
