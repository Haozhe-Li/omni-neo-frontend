import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Omni Knows',
        short_name: 'Omni',
        description: 'Advanced AI-powered research agent',
        start_url: '/',
        display: 'standalone',
        // The installed app's splash and OS chrome should be the paper
        // ground, not white-on-black — otherwise launching from the home
        // screen flashes a color the product never uses.
        background_color: '#FAF6EF',
        theme_color: '#FAF6EF',
        icons: [
            {
                src: '/android-chrome-192x192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/android-chrome-512x512.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    }
}
