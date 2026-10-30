import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { ApiHttpError, UnauthorizedError } from '@/lib/errors'
import { LoginPage } from '@/components/LoginPage'
import { useAuth } from '@/lib/AuthContext'

vi.mock('@/lib/AuthContext', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/AuthContext')>(),
  useAuth: vi.fn(),
}))

const register = vi.fn()
const login = vi.fn()
const resendVerification = vi.fn()
function apiError(status: number, detail: unknown) {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status, statusText: 'Error', data: { detail }, headers: {}, config: {} as InternalAxiosRequestConfig,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/register')
  vi.mocked(useAuth).mockReturnValue({ register, login, resendVerification, isLoading: false } as unknown as ReturnType<typeof useAuth>)
  resendVerification.mockResolvedValue(undefined)
})

describe('verification recovery', () => {
  it('offers a verification request for an existing registration without creating another account', async () => {
    register.mockRejectedValue(new ApiHttpError('Email already registered', { statusCode: 409 }))
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Volledige naam'), { target: { value: 'Sam Example' } })
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'sam@example.com' } })
    fireEvent.change(screen.getByLabelText('Wachtwoord'), { target: { value: 'StrongPassword123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Maak je gratis account aan' }))
    const resend = await screen.findByRole('button', { name: 'Verificatie-e-mail opnieuw verzenden' })
    expect(screen.getByText('Dit e-mailadres is al geregistreerd')).toBeInTheDocument()
    fireEvent.click(resend)
    await waitFor(() => expect(resendVerification).toHaveBeenCalledWith('sam@example.com'))
    expect(register).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Als je account nog niet is bevestigd/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Opnieuw verzenden over/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'other@example.com' } })
    expect(screen.queryByText('Dit e-mailadres is al geregistreerd')).not.toBeInTheDocument()
  })

  it('keeps a failed verification request retryable without claiming it was sent', async () => {
    window.history.replaceState({}, '', '/login')
    login.mockRejectedValue(new UnauthorizedError('Verify email', { statusCode: 403, errorCode: 'EMAIL_NOT_VERIFIED' }))
    resendVerification.mockRejectedValueOnce(apiError(500, 'Unavailable'))
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'sam@example.com' } })
    fireEvent.change(screen.getByLabelText('Wachtwoord'), { target: { value: 'StrongPassword123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inloggen' }))
    const resend = await screen.findByRole('button', { name: 'Verificatie-e-mail opnieuw verzenden' })
    fireEvent.click(resend)
    expect(await screen.findByText('Verzenden is niet gelukt. Probeer het opnieuw.')).toBeInTheDocument()
    expect(resend).not.toBeDisabled()
    expect(screen.queryByText(/Als je account nog niet is bevestigd/)).not.toBeInTheDocument()
  })

  it('offers verification again after valid credentials for an unverified account', async () => {
    window.history.replaceState({}, '', '/login')
    login.mockRejectedValue(new UnauthorizedError('Verify email', { statusCode: 403, errorCode: 'EMAIL_NOT_VERIFIED' }))
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'sam@example.com' } })
    fireEvent.change(screen.getByLabelText('Wachtwoord'), { target: { value: 'StrongPassword123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inloggen' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Verificatie-e-mail opnieuw verzenden' }))
    await waitFor(() => expect(resendVerification).toHaveBeenCalledWith('sam@example.com'))
  })
})
