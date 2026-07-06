import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/private/', '/thread/'],
        },
        sitemap: 'https://omniknows.xyz/sitemap.xml',
    }
}
