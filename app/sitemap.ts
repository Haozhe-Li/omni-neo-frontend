import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: 'https://omniknows.xyz',
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1,
        },
        // Add other routes here as the application grows
    ]
}
