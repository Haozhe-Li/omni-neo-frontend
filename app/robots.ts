import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/private/', '/thread/', '/collect', '/api/collect'],
        },
        sitemap: 'https://omniknows.xyz/sitemap.xml',
    }
}
