import { SITE_URL } from './lib/brand';

export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/login', '/api'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
