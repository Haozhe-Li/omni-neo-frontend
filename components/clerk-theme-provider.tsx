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

/* Clerk renders into a portal where this app's CSS custom properties don't
   reliably cascade, so the paper palette has to be handed over as literals.
   These are the same values as `--paper-raised`, `--ink`, `--teal` etc. in
   globals.css — when those change, change these. */
const lightVars = {
    colorPrimary: '#26696B',
    colorBackground: '#FFFDF9',
    colorText: '#2B2724',
    colorTextSecondary: '#6C6357',
    colorInputBackground: '#FAF6EF',
    colorInputText: '#2B2724',
    colorNeutral: '#2B2724',
    colorDanger: '#B3452C',
    borderRadius: '0.875rem',
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, sans-serif",
}

const darkVars = {
    colorPrimary: '#6FB4AF',
    colorBackground: '#201C19',
    colorText: '#F2EBE0',
    colorTextSecondary: '#9E9382',
    colorInputBackground: '#191614',
    colorInputText: '#F2EBE0',
    colorNeutral: '#F2EBE0',
    colorDanger: '#E0705A',
    borderRadius: '0.875rem',
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, sans-serif",
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
                    formButtonPrimary: isDark
                        ? 'bg-[#6FB4AF] text-[#14100D] hover:bg-[#8ECCC7]'
                        : 'bg-[#26696B] text-[#FAF6EF] hover:bg-[#1D5456]',
                    footerActionLink: isDark
                        ? 'text-[#6FB4AF] hover:text-[#8ECCC7]'
                        : 'text-[#26696B] hover:text-[#1D5456]',
                    profileSectionPrimaryButton: isDark ? 'text-[#6FB4AF]' : 'text-[#26696B]',
                    badge: isDark ? 'bg-[#6FB4AF] text-[#14100D]' : 'bg-[#26696B] text-[#FAF6EF]',
                    navbarButton: 'rounded-full',
                    avatarBox: 'rounded-full',
                },
            }}
            localization={clerkLocalization}
        >
            {children}
        </ClerkProvider>
    )
}
