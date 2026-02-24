'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import { useTheme } from 'next-themes'

const clerkLocalization = {
    locale: 'en-US',
    socialButtonsBlockButton: 'Continue with {{provider|titleize}}',
    dividerText: 'or',
    formButtonPrimary: 'Continue',
    formFieldLabel__emailAddress: 'Email',
    formFieldInputPlaceholder__emailAddress: 'Enter your email',
    formFieldLabel__password: 'Password',
    formFieldInputPlaceholder__password: 'Enter your password',
    formResendCodeNotReceivedMessage: "Didn't receive a code?",
    formResendCodeLink: 'Resend',
    footerActionLink__useAnotherMethod: 'Use another method',
    signIn: {
        start: {
            title: 'Sign in to Omni Knows',
            subtitle: 'Sign in to sync your chats and settings across all devices, and continue using Canvas and Auto mode',
            actionText: "Don't have an account?",
            actionLink: 'Sign up',
        },
    },
    signUp: {
        start: {
            title: 'Create your Omni Knows account',
            subtitle: 'Create an account to sync your chats and settings across all devices and unlock unlimited usage',
            actionText: 'Already have an account?',
            actionLink: 'Sign in',
        },
    },
} as const

const lightVars = {
    colorPrimary: '#20B2AA',
    colorBackground: '#ffffff',
    colorText: '#1a1a1a',
    colorTextSecondary: '#6b6b6b',
    colorInputBackground: '#f3f3ee',
    colorInputText: '#1a1a1a',
    colorNeutral: '#1a1a1a',
    colorDanger: '#e54d2e',
    borderRadius: '0.75rem',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
}

const darkVars = {
    colorPrimary: '#20B2AA',
    colorBackground: '#222323',
    colorText: '#ffffff',
    colorTextSecondary: '#8b8b8b',
    colorInputBackground: '#191A1A',
    colorInputText: '#ffffff',
    colorNeutral: '#ffffff',
    colorDanger: '#e54d2e',
    borderRadius: '0.75rem',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
}

export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'

    return (
        <ClerkProvider
            appearance={{
                baseTheme: isDark ? dark : undefined,
                variables: isDark ? darkVars : lightVars,
                elements: {
                    card: 'shadow-lg',
                    formButtonPrimary: 'bg-[#20B2AA] hover:opacity-90',
                    footerActionLink: 'text-[#20B2AA] hover:text-[#1a9e97]',
                    profileSectionPrimaryButton: 'text-[#20B2AA]',
                    badge: 'bg-[#20B2AA] text-white',
                    navbarButton: 'rounded-lg',
                    avatarBox: 'rounded-full',
                },
            }}
            localization={clerkLocalization}
        >
            {children}
        </ClerkProvider>
    )
}
